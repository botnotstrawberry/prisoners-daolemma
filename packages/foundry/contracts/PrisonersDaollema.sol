// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IAgentAuthRegistry {
    function isAuthorized(address wallet) external view returns (bool);
    function agentKeyOf(address wallet) external view returns (bytes32);
}

/// @title Prisoners DAOllema
/// @notice Real v1 game/join foundation for the Prisoners DAOllema hackathon build.
/// @dev This slice intentionally implements only:
///      - global config / cause whitelist management
///      - one-active-game-at-a-time game creation into JOINING
///      - per-game config snapshots, including treasury snapshot scaffolding for later settlement
///      - auth-gated join flow with wallet/agent uniqueness checks
///      - join -> commit -> reveal timing transitions
///      - current-round commit/reveal storage and validation
///      - cheap read helpers for later chat/replay/indexing work
///      Settlement, refunds, and round resolution remain for later slices.
contract PrisonersDaollema is Ownable {
    error InvalidTreasury();
    error InvalidAuthRegistry();
    error InvalidRecipient();
    error InvalidGameConfig();
    error UnsafePhase();
    error NoWhitelistedCauses();
    error MissingGame();
    error GameNotJoining();
    error GameNotCommitPhase();
    error GameNotRevealPhase();
    error JoinWindowClosed();
    error JoinWindowStillOpen();
    error CommitWindowClosed();
    error RevealWindowClosed();
    error CommitPhaseStillOpen();
    error MinimumPlayersMet();
    error InvalidPhaseAdvance();
    error UnauthorizedWallet();
    error DuplicateWallet();
    error DuplicateAgentKey();
    error InvalidCause();
    error EntryFeeMismatch();
    error MaxPlayersReached();
    error MaxCausesReached();
    error PlayerNotJoined();
    error PlayerNotAlive();
    error InvalidCommitment();
    error DuplicateCommit();
    error MissingCommitment();
    error InvalidChoice();
    error DuplicateReveal();
    error InvalidRevealPreimage();

    uint16 public constant MAX_PLAYER_CAP = 256;
    uint16 public constant MAX_CAUSE_CAP = 16;
    uint16 public constant MAX_FEE_BPS = 500;
    uint16 public constant BPS_DENOMINATOR = 10_000;

    enum Choice {
        Unset,
        Share,
        Catch,
        Steal
    }

    enum Phase {
        Idle,
        Joining,
        Commit,
        Reveal,
        Ended,
        Cancelled
    }

    enum Outcome {
        Unset,
        Winners,
        NoWinners,
        Cancelled
    }

    struct GameConfig {
        uint256 entryFeeWei;
        uint16 creatorFeeBps;
        uint16 causeFeeBps;
        uint32 joinDurationSeconds;
        uint32 commitDurationBlocks;
        uint32 revealDurationBlocks;
        uint16 minPlayers;
        uint16 maxPlayers;
        uint16 maxCauses;
    }

    struct GameSnapshot {
        uint256 entryFeeWei;
        uint16 creatorFeeBps;
        uint16 causeFeeBps;
        uint32 joinDurationSeconds;
        uint32 commitDurationBlocks;
        uint32 revealDurationBlocks;
        uint16 minPlayers;
        uint16 maxPlayers;
        uint16 maxCauses;
        uint16 joinedCount;
        uint16 aliveCount;
        uint16 usedCauseCount;
        uint16 committedCount;
        uint16 revealedCount;
        uint64 createdAt;
        uint64 joinDeadline;
        uint64 commitDeadlineBlock;
        uint64 revealDeadlineBlock;
        uint32 round;
        uint32 shareStreak;
        Phase phase;
        Outcome outcome;
        address treasury;
    }

    struct PlayerState {
        bool joined;
        bool alive;
        bool claimed;
        bool refunded;
        bool committedThisRound;
        bool revealedThisRound;
        address wallet;
        bytes32 agentKey;
        uint16 causeId;
        bytes32 commitment;
        Choice revealedChoice;
    }

    struct CauseDefinition {
        bool active;
        address recipient;
        bytes32 metadataHash;
    }

    struct GameCauseState {
        bool used;
        uint16 entrantCount;
        address recipient;
        bytes32 metadataHash;
    }

    address public treasury;
    address public authRegistry;
    GameConfig public defaultConfig;

    uint256 public currentGameId;
    uint256 public activeGameId;

    uint16 private _activeCauseCount;

    mapping(uint16 causeId => CauseDefinition cause) private _causes;
    mapping(uint16 causeId => bool known) private _causeKnown;
    uint16[] private _causeIds;

    mapping(uint256 gameId => GameSnapshot game) private _games;
    mapping(uint256 gameId => mapping(address wallet => PlayerState player)) private _players;
    mapping(uint256 gameId => mapping(bytes32 agentKey => bool joined)) private _agentJoined;
    mapping(uint256 gameId => address[] roster) private _playerList;
    mapping(uint256 gameId => mapping(uint16 causeId => GameCauseState causeState)) private _gameCauses;
    mapping(uint256 gameId => uint16[] causeIds) private _gameCauseIds;

    event TreasuryUpdated(address indexed previousTreasury, address indexed newTreasury);
    event AuthRegistryUpdated(address indexed previousAuthRegistry, address indexed newAuthRegistry);
    event DefaultsConfigured(
        uint256 entryFeeWei,
        uint16 creatorFeeBps,
        uint16 causeFeeBps,
        uint32 joinDurationSeconds,
        uint32 commitDurationBlocks,
        uint32 revealDurationBlocks,
        uint16 minPlayers,
        uint16 maxPlayers,
        uint16 maxCauses
    );
    event CauseWhitelisted(uint16 indexed causeId, address indexed recipient, bytes32 metadataHash);
    event CauseRemoved(uint16 indexed causeId);
    event GameCreated(
        uint256 indexed gameId,
        uint64 joinDeadline,
        uint256 entryFeeWei,
        uint16 minPlayers,
        uint16 maxPlayers,
        uint16 maxCauses
    );
    event PhaseAdvanced(uint256 indexed gameId, Phase newPhase);
    event GameCancelled(uint256 indexed gameId);
    event PlayerJoined(
        uint256 indexed gameId, address indexed wallet, bytes32 indexed agentKey, uint16 causeId, uint16 joinedCount
    );
    event Committed(uint256 indexed gameId, uint32 indexed round, address indexed wallet, bytes32 commitment);
    event Revealed(uint256 indexed gameId, uint32 indexed round, address indexed wallet, Choice choice);

    constructor(address owner_, address treasury_, address authRegistry_, GameConfig memory defaultConfig_)
        Ownable(owner_)
    {
        _setTreasury(treasury_);
        _setAuthRegistry(authRegistry_);
        _setDefaultConfig(defaultConfig_);
    }

    function setTreasury(address newTreasury) external onlyOwner {
        _requireIdle();
        _setTreasury(newTreasury);
    }

    function setAuthRegistry(address newAuthRegistry) external onlyOwner {
        _requireIdle();
        _setAuthRegistry(newAuthRegistry);
    }

    function configureDefaults(GameConfig calldata newDefaultConfig) external onlyOwner {
        _requireIdle();
        _setDefaultConfig(newDefaultConfig);
    }

    function whitelistCause(uint16 causeId, address recipient, bytes32 metadataHash) external onlyOwner {
        _requireIdle();
        if (recipient == address(0)) revert InvalidRecipient();

        CauseDefinition storage cause = _causes[causeId];
        if (!cause.active) {
            _activeCauseCount += 1;
        }
        cause.active = true;
        cause.recipient = recipient;
        cause.metadataHash = metadataHash;

        if (!_causeKnown[causeId]) {
            _causeKnown[causeId] = true;
            _causeIds.push(causeId);
        }

        emit CauseWhitelisted(causeId, recipient, metadataHash);
    }

    function removeCause(uint16 causeId) external onlyOwner {
        _requireIdle();

        CauseDefinition storage cause = _causes[causeId];
        if (!cause.active) revert InvalidCause();

        cause.active = false;
        _activeCauseCount -= 1;

        emit CauseRemoved(causeId);
    }

    function createGame() external onlyOwner returns (uint256 gameId) {
        _requireIdle();
        if (_activeCauseCount == 0) revert NoWhitelistedCauses();

        GameConfig memory config = defaultConfig;
        uint64 createdAt = uint64(block.timestamp);
        uint64 joinDeadline = uint64(block.timestamp + uint256(config.joinDurationSeconds));

        gameId = ++currentGameId;
        activeGameId = gameId;

        _games[gameId] = GameSnapshot({
            entryFeeWei: config.entryFeeWei,
            creatorFeeBps: config.creatorFeeBps,
            causeFeeBps: config.causeFeeBps,
            joinDurationSeconds: config.joinDurationSeconds,
            commitDurationBlocks: config.commitDurationBlocks,
            revealDurationBlocks: config.revealDurationBlocks,
            minPlayers: config.minPlayers,
            maxPlayers: config.maxPlayers,
            maxCauses: config.maxCauses,
            joinedCount: 0,
            aliveCount: 0,
            usedCauseCount: 0,
            committedCount: 0,
            revealedCount: 0,
            createdAt: createdAt,
            joinDeadline: joinDeadline,
            commitDeadlineBlock: 0,
            revealDeadlineBlock: 0,
            round: 0,
            shareStreak: 0,
            phase: Phase.Joining,
            outcome: Outcome.Unset,
            treasury: treasury
        });

        emit GameCreated(
            gameId, joinDeadline, config.entryFeeWei, config.minPlayers, config.maxPlayers, config.maxCauses
        );
        emit PhaseAdvanced(gameId, Phase.Joining);
    }

    function advancePhase(uint256 gameId) external {
        GameSnapshot storage game = _games[gameId];
        if (!_gameExists(gameId)) revert MissingGame();

        if (game.phase == Phase.Joining) {
            if (block.timestamp <= game.joinDeadline) revert JoinWindowStillOpen();

            if (game.joinedCount < game.minPlayers) {
                _cancelGame(gameId, game);
            } else {
                _startCommitPhase(gameId, game);
            }

            return;
        }

        if (game.phase == Phase.Commit) {
            if (!_commitPhaseAdvanceReady(game)) revert CommitPhaseStillOpen();
            _startRevealPhase(gameId, game);
            return;
        }

        revert InvalidPhaseAdvance();
    }

    function cancelIfInsufficientPlayers(uint256 gameId) external {
        GameSnapshot storage game = _games[gameId];
        if (!_gameExists(gameId)) revert MissingGame();
        if (game.phase != Phase.Joining) revert GameNotJoining();
        if (block.timestamp <= game.joinDeadline) revert JoinWindowStillOpen();
        if (game.joinedCount >= game.minPlayers) revert MinimumPlayersMet();

        _cancelGame(gameId, game);
    }

    function join(uint256 gameId, uint16 causeId) external payable {
        GameSnapshot storage game = _games[gameId];
        if (!_gameExists(gameId)) revert MissingGame();
        if (game.phase != Phase.Joining || activeGameId != gameId) revert GameNotJoining();
        if (block.timestamp > game.joinDeadline) revert JoinWindowClosed();
        if (msg.value != game.entryFeeWei) revert EntryFeeMismatch();
        if (!_isAuthorized(msg.sender)) revert UnauthorizedWallet();

        PlayerState storage existingPlayer = _players[gameId][msg.sender];
        if (existingPlayer.joined) revert DuplicateWallet();
        if (game.joinedCount >= game.maxPlayers) revert MaxPlayersReached();

        bytes32 agentKey = IAgentAuthRegistry(authRegistry).agentKeyOf(msg.sender);
        if (agentKey == bytes32(0)) revert UnauthorizedWallet();
        if (_agentJoined[gameId][agentKey]) revert DuplicateAgentKey();

        CauseDefinition memory cause = _causes[causeId];
        if (!cause.active) revert InvalidCause();

        GameCauseState storage gameCause = _gameCauses[gameId][causeId];
        if (!gameCause.used) {
            if (game.usedCauseCount >= game.maxCauses) revert MaxCausesReached();

            gameCause.used = true;
            gameCause.recipient = cause.recipient;
            gameCause.metadataHash = cause.metadataHash;
            game.usedCauseCount += 1;
            _gameCauseIds[gameId].push(causeId);
        }

        _agentJoined[gameId][agentKey] = true;
        _playerList[gameId].push(msg.sender);
        _players[gameId][msg.sender] = PlayerState({
            joined: true,
            alive: true,
            claimed: false,
            refunded: false,
            committedThisRound: false,
            revealedThisRound: false,
            wallet: msg.sender,
            agentKey: agentKey,
            causeId: causeId,
            commitment: bytes32(0),
            revealedChoice: Choice.Unset
        });

        game.joinedCount += 1;
        game.aliveCount += 1;
        gameCause.entrantCount += 1;

        emit PlayerJoined(gameId, msg.sender, agentKey, causeId, game.joinedCount);
    }

    function commit(uint256 gameId, bytes32 commitment) external {
        GameSnapshot storage game = _games[gameId];
        if (!_gameExists(gameId)) revert MissingGame();
        if (game.phase != Phase.Commit || activeGameId != gameId) revert GameNotCommitPhase();
        if (block.number > game.commitDeadlineBlock) revert CommitWindowClosed();
        if (commitment == bytes32(0)) revert InvalidCommitment();

        PlayerState storage player = _players[gameId][msg.sender];
        if (!player.joined) revert PlayerNotJoined();
        if (!player.alive) revert PlayerNotAlive();
        if (player.committedThisRound) revert DuplicateCommit();

        player.commitment = commitment;
        player.committedThisRound = true;
        player.revealedThisRound = false;
        player.revealedChoice = Choice.Unset;

        game.committedCount += 1;

        emit Committed(gameId, game.round, msg.sender, commitment);
    }

    function reveal(uint256 gameId, Choice choice, bytes32 salt) external {
        GameSnapshot storage game = _games[gameId];
        if (!_gameExists(gameId)) revert MissingGame();
        if (game.phase != Phase.Reveal || activeGameId != gameId) revert GameNotRevealPhase();
        if (block.number > game.revealDeadlineBlock) revert RevealWindowClosed();
        if (choice == Choice.Unset) revert InvalidChoice();

        PlayerState storage player = _players[gameId][msg.sender];
        if (!player.joined) revert PlayerNotJoined();
        if (!player.alive) revert PlayerNotAlive();
        if (!player.committedThisRound) revert MissingCommitment();
        if (player.revealedThisRound) revert DuplicateReveal();

        if (player.commitment != _computeCommitment(gameId, game.round, msg.sender, choice, salt)) {
            revert InvalidRevealPreimage();
        }

        player.revealedChoice = choice;
        player.revealedThisRound = true;

        game.revealedCount += 1;

        emit Revealed(gameId, game.round, msg.sender, choice);
    }

    function isAdmissionReady(address wallet) external view returns (bool) {
        if (wallet == address(0) || authRegistry == address(0)) return false;
        return _isAuthorized(wallet);
    }

    function admissionAgentKey(address wallet) external view returns (bytes32) {
        if (wallet == address(0) || authRegistry == address(0)) return bytes32(0);
        return IAgentAuthRegistry(authRegistry).agentKeyOf(wallet);
    }

    function gameExists(uint256 gameId) external view returns (bool) {
        return _gameExists(gameId);
    }

    function getDefaultConfig() external view returns (GameConfig memory) {
        return defaultConfig;
    }

    function getGame(uint256 gameId) external view returns (GameSnapshot memory) {
        return _games[gameId];
    }

    function getPlayer(uint256 gameId, address wallet) external view returns (PlayerState memory) {
        return _players[gameId][wallet];
    }

    function getCause(uint16 causeId) external view returns (CauseDefinition memory) {
        return _causes[causeId];
    }

    function getGameCause(uint256 gameId, uint16 causeId) external view returns (GameCauseState memory) {
        return _gameCauses[gameId][causeId];
    }

    function isCauseWhitelisted(uint16 causeId) external view returns (bool) {
        return _causes[causeId].active;
    }

    function activeCauseCount() external view returns (uint16) {
        return _activeCauseCount;
    }

    function causeCount() external view returns (uint256) {
        return _causeIds.length;
    }

    function causeAt(uint256 index) external view returns (uint16) {
        return _causeIds[index];
    }

    function playerCount(uint256 gameId) external view returns (uint256) {
        return _playerList[gameId].length;
    }

    function playerAt(uint256 gameId, uint256 index) external view returns (address) {
        return _playerList[gameId][index];
    }

    function gameCauseCount(uint256 gameId) external view returns (uint256) {
        return _gameCauseIds[gameId].length;
    }

    function gameCauseAt(uint256 gameId, uint256 index) external view returns (uint16) {
        return _gameCauseIds[gameId][index];
    }

    function isJoined(uint256 gameId, address wallet) public view returns (bool) {
        return _players[gameId][wallet].joined;
    }

    function isAlive(uint256 gameId, address wallet) external view returns (bool) {
        return _players[gameId][wallet].alive;
    }

    function playerCause(uint256 gameId, address wallet) external view returns (uint16) {
        return _players[gameId][wallet].causeId;
    }

    function causeEntrants(uint256 gameId, uint16 causeId) external view returns (uint16) {
        return _gameCauses[gameId][causeId].entrantCount;
    }

    function gameCauseRecipient(uint256 gameId, uint16 causeId) external view returns (address) {
        return _gameCauses[gameId][causeId].recipient;
    }

    function canAdvancePhase(uint256 gameId) public view returns (bool) {
        if (!_gameExists(gameId)) return false;

        GameSnapshot memory game = _games[gameId];
        if (game.phase == Phase.Joining) {
            return block.timestamp > game.joinDeadline;
        }
        if (game.phase == Phase.Commit) {
            return _commitPhaseAdvanceReady(game);
        }

        return false;
    }

    function isRoundReadyForResolution(uint256 gameId) public view returns (bool) {
        if (!_gameExists(gameId)) return false;

        GameSnapshot memory game = _games[gameId];
        if (game.phase != Phase.Reveal) return false;

        return _revealPhaseReadyForResolution(game);
    }

    function computeCommitment(uint256 gameId, uint32 round, address wallet, Choice choice, bytes32 salt)
        external
        pure
        returns (bytes32)
    {
        return _computeCommitment(gameId, round, wallet, choice, salt);
    }

    function _requireIdle() internal view {
        if (activeGameId != 0) revert UnsafePhase();
    }

    function _setTreasury(address newTreasury) internal {
        if (newTreasury == address(0)) revert InvalidTreasury();

        address previousTreasury = treasury;
        treasury = newTreasury;

        emit TreasuryUpdated(previousTreasury, newTreasury);
    }

    function _setAuthRegistry(address newAuthRegistry) internal {
        if (newAuthRegistry == address(0)) revert InvalidAuthRegistry();

        address previousAuthRegistry = authRegistry;
        authRegistry = newAuthRegistry;

        emit AuthRegistryUpdated(previousAuthRegistry, newAuthRegistry);
    }

    function _setDefaultConfig(GameConfig memory config) internal {
        _validateGameConfig(config);
        defaultConfig = config;

        emit DefaultsConfigured(
            config.entryFeeWei,
            config.creatorFeeBps,
            config.causeFeeBps,
            config.joinDurationSeconds,
            config.commitDurationBlocks,
            config.revealDurationBlocks,
            config.minPlayers,
            config.maxPlayers,
            config.maxCauses
        );
    }

    function _validateGameConfig(GameConfig memory config) internal pure {
        if (
            config.entryFeeWei == 0 || config.joinDurationSeconds == 0 || config.commitDurationBlocks == 0
                || config.revealDurationBlocks == 0 || config.minPlayers == 0 || config.maxPlayers == 0
                || config.maxCauses == 0 || config.minPlayers > config.maxPlayers || config.maxPlayers > MAX_PLAYER_CAP
                || config.maxCauses > MAX_CAUSE_CAP || config.maxCauses > config.maxPlayers
                || config.creatorFeeBps > MAX_FEE_BPS || config.causeFeeBps > MAX_FEE_BPS
        ) {
            revert InvalidGameConfig();
        }
    }

    function _startCommitPhase(uint256 gameId, GameSnapshot storage game) internal {
        game.phase = Phase.Commit;
        game.round += 1;
        game.committedCount = 0;
        game.revealedCount = 0;
        game.commitDeadlineBlock = uint64(block.number + uint256(game.commitDurationBlocks));
        game.revealDeadlineBlock = 0;

        emit PhaseAdvanced(gameId, Phase.Commit);
    }

    function _startRevealPhase(uint256 gameId, GameSnapshot storage game) internal {
        game.phase = Phase.Reveal;
        game.revealedCount = 0;
        game.revealDeadlineBlock = uint64(block.number + uint256(game.revealDurationBlocks));

        emit PhaseAdvanced(gameId, Phase.Reveal);
    }

    function _cancelGame(uint256 gameId, GameSnapshot storage game) internal {
        game.phase = Phase.Cancelled;
        game.outcome = Outcome.Cancelled;

        if (activeGameId == gameId) {
            activeGameId = 0;
        }

        emit GameCancelled(gameId);
        emit PhaseAdvanced(gameId, Phase.Cancelled);
    }

    function _commitPhaseAdvanceReady(GameSnapshot memory game) internal view returns (bool) {
        return game.committedCount == game.aliveCount || block.number > game.commitDeadlineBlock;
    }

    function _revealPhaseReadyForResolution(GameSnapshot memory game) internal view returns (bool) {
        return game.revealedCount == game.committedCount || block.number > game.revealDeadlineBlock;
    }

    function _computeCommitment(uint256 gameId, uint32 round, address wallet, Choice choice, bytes32 salt)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(gameId, round, wallet, choice, salt));
    }

    function _isAuthorized(address wallet) internal view returns (bool) {
        return IAgentAuthRegistry(authRegistry).isAuthorized(wallet);
    }

    function _gameExists(uint256 gameId) internal view returns (bool) {
        return gameId != 0 && _games[gameId].createdAt != 0;
    }
}
