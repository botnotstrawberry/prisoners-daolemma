// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IAgentAuthRegistry {
    function isAuthorized(address wallet) external view returns (bool);
    function agentKeyOf(address wallet) external view returns (bytes32);
}

/// @title Prisoners DAOlemma
/// @notice Real v1 game foundation for the Prisoners DAOlemma hackathon build.
/// @dev This slice implements:
///      - global config / cause whitelist management
///      - one-active-game-at-a-time game creation into JOINING
///      - per-game config snapshots, including settlement-critical treasury/cause snapshots
///      - auth-gated join flow with wallet/agent uniqueness checks
///      - join -> commit -> reveal -> resolve timing transitions
///      - canonical round resolution with defaulted SHARE handling
///      - elimination, share-streak, terminal outcomes, and settlement finalization
///      - winner claims, cancelled-game refunds, and pull-based cause/treasury withdrawals
contract PrisonersDAOlemma is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

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
    error RevealPhaseStillOpen();
    error MinimumPlayersMet();
    error InvalidPhaseAdvance();
    error InvalidResolutionState();
    error UnauthorizedWallet();
    error DuplicateWallet();
    error DuplicateAgentKey();
    error InvalidCause();
    error InvalidRescueToken();
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
    error ClaimUnavailable();
    error RefundUnavailable();
    error AlreadyClaimed();
    error AlreadyRefunded();
    error NothingToWithdraw();
    error TransferFailed();
    error SettlementAlreadyFinalized();
    error InvalidRescueAmount();
    error RescueUnavailableDuringLiveGame();
    error InsufficientExcessETH(uint256 requested, uint256 available);

    uint16 public constant MAX_PLAYER_CAP = 256;
    uint16 public constant MAX_CAUSE_CAP = 16;
    uint16 public constant MAX_FEE_BPS = 500;
    uint16 public constant BPS_DENOMINATOR = 10_000;
    uint16 public constant NO_WINNER_CAUSE_BPS = 9_000;

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
        Choice effectiveChoice;
        uint32 lastChoiceRound;
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

    struct SettlementState {
        uint256 totalPotWei;
        uint256 creatorFeeWei;
        uint256 treasuryAccruedWei;
        uint256 treasuryWithdrawnWei;
        uint256 winnerShareWei;
        uint256 refundPerPlayerWei;
        uint256 noWinnerCausePoolWei;
        uint256 noWinnerCauseDistributedWei;
        uint16 winnerCount;
        bool finalized;
    }

    struct ResolutionTally {
        uint16 sharers;
        uint16 catchers;
        uint16 stealers;
        uint16 eliminatedCount;
    }

    address public treasury;
    address public authRegistry;
    GameConfig public defaultConfig;

    uint256 public currentGameId;
    uint256 public activeGameId;

    /// @dev Aggregate outstanding ETH obligations across joined pots, unclaimed refunds/prizes,
    ///      and unwithdrawn cause/treasury balances. Force-sent ETH is intentionally excluded.
    uint256 private _accountedETHLiabilities;

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
    mapping(uint256 gameId => SettlementState settlement) private _settlements;
    mapping(uint256 gameId => mapping(uint16 causeId => uint256 routedWei)) private _gameCauseRoutedWei;
    mapping(uint256 gameId => mapping(uint16 causeId => uint256 withdrawnWei)) private _gameCauseWithdrawnWei;

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
    event GameEnded(uint256 indexed gameId, Outcome outcome, uint32 round, uint16 winnerCount, uint32 shareStreak);
    event PlayerJoined(
        uint256 indexed gameId, address indexed wallet, bytes32 indexed agentKey, uint16 causeId, uint16 joinedCount
    );
    event Committed(uint256 indexed gameId, uint32 indexed round, address indexed wallet, bytes32 commitment);
    event Revealed(uint256 indexed gameId, uint32 indexed round, address indexed wallet, Choice choice);
    event EffectiveChoiceMaterialized(
        uint256 indexed gameId,
        uint32 indexed round,
        address indexed wallet,
        Choice choice,
        bool defaultedCommit,
        bool defaultedReveal
    );
    event PlayerEliminated(uint256 indexed gameId, uint32 indexed round, address indexed wallet, Choice choice);
    event RoundResolved(
        uint256 indexed gameId,
        uint32 indexed round,
        uint16 sharers,
        uint16 catchers,
        uint16 stealers,
        uint16 eliminatedCount,
        uint16 aliveCount,
        uint32 shareStreak
    );
    event SettlementFinalized(
        uint256 indexed gameId,
        Outcome outcome,
        uint256 totalPotWei,
        uint256 creatorFeeWei,
        uint16 winnerCount,
        uint256 winnerShareWei,
        uint256 refundPerPlayerWei,
        uint256 noWinnerCausePoolWei,
        uint256 treasuryAccruedWei
    );
    event PrizeClaimed(
        uint256 indexed gameId,
        address indexed wallet,
        uint16 indexed causeId,
        uint256 grossPrizeWei,
        uint256 causeCutWei,
        uint256 netPrizeWei,
        address causeRecipient
    );
    event RefundClaimed(uint256 indexed gameId, address indexed wallet, uint256 refundWei);
    event NoWinnerDistributed(
        uint256 indexed gameId, uint16 indexed causeId, address indexed recipient, uint256 amountWei
    );
    event TreasuryAccrued(uint256 indexed gameId, address indexed treasury, uint256 amountWei);
    event TreasuryWithdrawal(uint256 indexed gameId, address indexed recipient, uint256 amountWei);
    event CauseWithdrawal(uint256 indexed gameId, uint16 indexed causeId, address indexed recipient, uint256 amountWei);
    event ForeignTokenRescued(address indexed token, address indexed to, uint256 amount);
    event ExcessETHRescued(address indexed to, uint256 amount);

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

        if (game.phase == Phase.Reveal) {
            if (!_revealPhaseReadyForResolution(game)) revert RevealPhaseStillOpen();
            _resolveRound(gameId, game);
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
            revealedChoice: Choice.Unset,
            effectiveChoice: Choice.Unset,
            lastChoiceRound: 0
        });

        game.joinedCount += 1;
        game.aliveCount += 1;
        gameCause.entrantCount += 1;
        _increaseAccountedETHLiability(msg.value);

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

    function claim(uint256 gameId) external nonReentrant {
        _claimPrize(gameId, msg.sender, msg.sender);
    }

    function claimTo(uint256 gameId, address recipient) external nonReentrant {
        _claimPrize(gameId, msg.sender, recipient);
    }

    function claimFor(uint256 gameId, address winner) external nonReentrant {
        _claimPrize(gameId, winner, winner);
    }

    function claimRefund(uint256 gameId) external nonReentrant {
        GameSnapshot storage game = _games[gameId];
        if (!_gameExists(gameId)) revert MissingGame();
        if (game.phase != Phase.Cancelled || game.outcome != Outcome.Cancelled) revert RefundUnavailable();

        PlayerState storage player = _players[gameId][msg.sender];
        if (!player.joined) revert PlayerNotJoined();
        if (player.refunded) revert AlreadyRefunded();
        if (player.claimed) revert AlreadyClaimed();

        SettlementState memory settlement = _settlements[gameId];
        if (!settlement.finalized) revert RefundUnavailable();

        player.refunded = true;

        uint256 refundWei = settlement.refundPerPlayerWei;
        _decreaseAccountedETHLiability(refundWei);
        _payout(msg.sender, refundWei);

        emit RefundClaimed(gameId, msg.sender, refundWei);
    }

    function withdrawTreasury(uint256 gameId) external nonReentrant {
        GameSnapshot storage game = _games[gameId];
        if (!_gameExists(gameId)) revert MissingGame();

        SettlementState storage settlement = _settlements[gameId];
        uint256 amountWei = treasuryClaimableAmount(gameId);
        if (amountWei == 0) revert NothingToWithdraw();

        settlement.treasuryWithdrawnWei += amountWei;
        _decreaseAccountedETHLiability(amountWei);
        _payout(game.treasury, amountWei);

        emit TreasuryWithdrawal(gameId, game.treasury, amountWei);
    }

    function withdrawCause(uint256 gameId, uint16 causeId) external nonReentrant {
        if (!_gameExists(gameId)) revert MissingGame();

        GameCauseState storage causeState = _gameCauses[gameId][causeId];
        if (!causeState.used) revert InvalidCause();

        uint256 amountWei = gameCauseClaimableAmount(gameId, causeId);
        if (amountWei == 0) revert NothingToWithdraw();

        _gameCauseWithdrawnWei[gameId][causeId] += amountWei;
        _decreaseAccountedETHLiability(amountWei);
        _payout(causeState.recipient, amountWei);

        emit CauseWithdrawal(gameId, causeId, causeState.recipient, amountWei);
    }

    function rescueERC20(address token, address to, uint256 amount) external onlyOwner nonReentrant {
        if (token == address(0)) revert InvalidRescueToken();
        if (to == address(0)) revert InvalidRecipient();
        if (amount == 0) revert InvalidRescueAmount();
        _requireRescueWindow();

        IERC20(token).safeTransfer(to, amount);

        emit ForeignTokenRescued(token, to, amount);
    }

    function rescueExcessETH(address payable to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert InvalidRecipient();
        if (amount == 0) revert InvalidRescueAmount();
        _requireRescueWindow();

        uint256 available = excessETH();
        if (amount > available) revert InsufficientExcessETH(amount, available);

        _payout(to, amount);

        emit ExcessETHRescued(to, amount);
    }

    function accountedETHLiabilities() public view returns (uint256) {
        return _accountedETHLiabilities;
    }

    function excessETH() public view returns (uint256) {
        uint256 contractBalance = address(this).balance;
        uint256 liabilities = _accountedETHLiabilities;
        return contractBalance > liabilities ? contractBalance - liabilities : 0;
    }

    function previewWinnerClaim(uint256 gameId, address wallet)
        external
        view
        returns (uint256 grossPrizeWei, uint256 causeCutWei, uint256 netPrizeWei, bool availableNow)
    {
        if (!_gameExists(gameId)) return (0, 0, 0, false);

        GameSnapshot storage game = _games[gameId];
        PlayerState storage player = _players[gameId][wallet];
        SettlementState storage settlement = _settlements[gameId];

        bool eligibleWinner = game.phase == Phase.Ended && game.outcome == Outcome.Winners && player.joined
            && player.alive && settlement.finalized;
        if (!eligibleWinner) return (0, 0, 0, false);

        grossPrizeWei = settlement.winnerShareWei;
        causeCutWei = grossPrizeWei * uint256(game.causeFeeBps) / BPS_DENOMINATOR;
        netPrizeWei = grossPrizeWei - causeCutWei;
        availableNow = !player.claimed && !player.refunded;
    }

    function previewRefund(uint256 gameId, address wallet)
        external
        view
        returns (uint256 refundWei, bool availableNow)
    {
        if (!_gameExists(gameId)) return (0, false);

        GameSnapshot storage game = _games[gameId];
        PlayerState storage player = _players[gameId][wallet];
        SettlementState storage settlement = _settlements[gameId];

        bool eligibleRefund =
            game.phase == Phase.Cancelled && game.outcome == Outcome.Cancelled && player.joined && settlement.finalized;
        if (!eligibleRefund) return (0, false);

        refundWei = settlement.refundPerPlayerWei;
        availableNow = !player.refunded && !player.claimed;
    }

    function treasuryClaimableAmount(uint256 gameId) public view returns (uint256) {
        SettlementState storage settlement = _settlements[gameId];
        return settlement.treasuryAccruedWei - settlement.treasuryWithdrawnWei;
    }

    function gameCauseClaimableAmount(uint256 gameId, uint16 causeId) public view returns (uint256) {
        return _gameCauseRoutedWei[gameId][causeId] - _gameCauseWithdrawnWei[gameId][causeId];
    }

    function gameCauseRoutedAmount(uint256 gameId, uint16 causeId) external view returns (uint256) {
        return _gameCauseRoutedWei[gameId][causeId];
    }

    function gameCauseWithdrawnAmount(uint256 gameId, uint16 causeId) external view returns (uint256) {
        return _gameCauseWithdrawnWei[gameId][causeId];
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

    function getSettlement(uint256 gameId) external view returns (SettlementState memory) {
        return _settlements[gameId];
    }

    function chatContext(uint256 gameId) external view returns (uint32 round, uint8 phase) {
        GameSnapshot memory game = _games[gameId];
        return (game.round, uint8(game.phase));
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
        if (game.phase == Phase.Reveal) {
            return _revealPhaseReadyForResolution(game);
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

    function _requireRescueWindow() internal view {
        if (!_liveGameActive()) return;
        revert RescueUnavailableDuringLiveGame();
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
                || config.revealDurationBlocks == 0 || config.minPlayers < 2 || config.maxPlayers == 0
                || config.maxCauses == 0 || config.minPlayers > config.maxPlayers || config.maxPlayers > MAX_PLAYER_CAP
                || config.maxCauses > MAX_CAUSE_CAP || config.maxCauses > config.maxPlayers
                || config.creatorFeeBps > MAX_FEE_BPS || config.causeFeeBps > MAX_FEE_BPS
        ) {
            revert InvalidGameConfig();
        }
    }

    function _startCommitPhase(uint256 gameId, GameSnapshot storage game) internal {
        _resetRoundStateForAlivePlayers(gameId);

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

    function _resolveRound(uint256 gameId, GameSnapshot storage game) internal {
        uint32 resolvedRound = game.round;
        ResolutionTally memory tally = _materializeEffectiveChoices(gameId, resolvedRound);

        bool hasShare = tally.sharers != 0;
        bool hasCatch = tally.catchers != 0;
        bool hasSteal = tally.stealers != 0;

        if (hasShare && !hasCatch && !hasSteal) {
            game.shareStreak += 1;

            emit RoundResolved(
                gameId,
                resolvedRound,
                tally.sharers,
                tally.catchers,
                tally.stealers,
                0,
                game.aliveCount,
                game.shareStreak
            );

            if (game.aliveCount == 1 || game.shareStreak >= 3) {
                _endResolvedGame(gameId, game, Outcome.Winners);
                return;
            }

            _startCommitPhase(gameId, game);
            return;
        }

        game.shareStreak = 0;

        if (!hasShare && hasCatch && !hasSteal) {
            tally.eliminatedCount = _eliminateMatchingChoice(gameId, game, resolvedRound, Choice.Catch);

            emit RoundResolved(
                gameId,
                resolvedRound,
                tally.sharers,
                tally.catchers,
                tally.stealers,
                tally.eliminatedCount,
                game.aliveCount,
                game.shareStreak
            );

            _endResolvedGame(gameId, game, Outcome.NoWinners);
            return;
        }

        if (!hasShare && !hasCatch && hasSteal) {
            tally.eliminatedCount = _eliminateMatchingChoice(gameId, game, resolvedRound, Choice.Steal);

            emit RoundResolved(
                gameId,
                resolvedRound,
                tally.sharers,
                tally.catchers,
                tally.stealers,
                tally.eliminatedCount,
                game.aliveCount,
                game.shareStreak
            );

            _endResolvedGame(gameId, game, Outcome.NoWinners);
            return;
        }

        if (hasShare && hasCatch && !hasSteal) {
            tally.eliminatedCount = _eliminateMatchingChoice(gameId, game, resolvedRound, Choice.Catch);

            emit RoundResolved(
                gameId,
                resolvedRound,
                tally.sharers,
                tally.catchers,
                tally.stealers,
                tally.eliminatedCount,
                game.aliveCount,
                game.shareStreak
            );

            if (game.aliveCount == 1) {
                _endResolvedGame(gameId, game, Outcome.Winners);
                return;
            }

            _startCommitPhase(gameId, game);
            return;
        }

        if (!hasShare && hasCatch && hasSteal) {
            tally.eliminatedCount = _eliminateMatchingChoice(gameId, game, resolvedRound, Choice.Steal);

            emit RoundResolved(
                gameId,
                resolvedRound,
                tally.sharers,
                tally.catchers,
                tally.stealers,
                tally.eliminatedCount,
                game.aliveCount,
                game.shareStreak
            );

            if (game.aliveCount == 1) {
                _endResolvedGame(gameId, game, Outcome.Winners);
                return;
            }

            _startCommitPhase(gameId, game);
            return;
        }

        if (hasShare && !hasCatch && hasSteal) {
            tally.eliminatedCount = _eliminateMatchingChoice(gameId, game, resolvedRound, Choice.Share);

            emit RoundResolved(
                gameId,
                resolvedRound,
                tally.sharers,
                tally.catchers,
                tally.stealers,
                tally.eliminatedCount,
                game.aliveCount,
                game.shareStreak
            );

            _endResolvedGame(gameId, game, Outcome.Winners);
            return;
        }

        if (hasShare && hasCatch && hasSteal) {
            tally.eliminatedCount = _eliminateMatchingChoice(gameId, game, resolvedRound, Choice.Steal);

            emit RoundResolved(
                gameId,
                resolvedRound,
                tally.sharers,
                tally.catchers,
                tally.stealers,
                tally.eliminatedCount,
                game.aliveCount,
                game.shareStreak
            );

            if (game.aliveCount == 1) {
                _endResolvedGame(gameId, game, Outcome.Winners);
                return;
            }

            _startCommitPhase(gameId, game);
            return;
        }

        revert InvalidResolutionState();
    }

    function _materializeEffectiveChoices(uint256 gameId, uint32 round)
        internal
        returns (ResolutionTally memory tally)
    {
        address[] storage roster = _playerList[gameId];
        uint256 rosterLength = roster.length;

        for (uint256 index = 0; index < rosterLength; ++index) {
            PlayerState storage player = _players[gameId][roster[index]];
            if (!player.alive) continue;

            (Choice choice, bool defaultedCommit, bool defaultedReveal) = _effectiveChoiceFor(player);

            player.effectiveChoice = choice;
            player.lastChoiceRound = round;

            if (choice == Choice.Share) {
                tally.sharers += 1;
            } else if (choice == Choice.Catch) {
                tally.catchers += 1;
            } else if (choice == Choice.Steal) {
                tally.stealers += 1;
            } else {
                revert InvalidChoice();
            }

            emit EffectiveChoiceMaterialized(gameId, round, player.wallet, choice, defaultedCommit, defaultedReveal);
        }
    }

    function _eliminateMatchingChoice(uint256 gameId, GameSnapshot storage game, uint32 round, Choice choice)
        internal
        returns (uint16 eliminatedCount)
    {
        address[] storage roster = _playerList[gameId];
        uint256 rosterLength = roster.length;

        for (uint256 index = 0; index < rosterLength; ++index) {
            PlayerState storage player = _players[gameId][roster[index]];
            if (!player.alive || player.lastChoiceRound != round || player.effectiveChoice != choice) continue;

            player.alive = false;
            eliminatedCount += 1;
            game.aliveCount -= 1;

            emit PlayerEliminated(gameId, round, player.wallet, choice);
        }
    }

    function _effectiveChoiceFor(PlayerState storage player)
        internal
        view
        returns (Choice choice, bool defaultedCommit, bool defaultedReveal)
    {
        if (!player.committedThisRound) {
            return (Choice.Share, true, false);
        }

        if (!player.revealedThisRound) {
            return (Choice.Share, false, true);
        }

        return (player.revealedChoice, false, false);
    }

    function _resetRoundStateForAlivePlayers(uint256 gameId) internal {
        address[] storage roster = _playerList[gameId];
        uint256 rosterLength = roster.length;

        for (uint256 index = 0; index < rosterLength; ++index) {
            PlayerState storage player = _players[gameId][roster[index]];
            if (!player.alive) continue;

            player.committedThisRound = false;
            player.revealedThisRound = false;
            player.commitment = bytes32(0);
            player.revealedChoice = Choice.Unset;
        }
    }

    function _endResolvedGame(uint256 gameId, GameSnapshot storage game, Outcome outcome) internal {
        game.phase = Phase.Ended;
        game.outcome = outcome;

        _finalizeEndedSettlement(gameId, game, outcome);

        if (activeGameId == gameId) {
            activeGameId = 0;
        }

        uint16 winnerCount = outcome == Outcome.Winners ? game.aliveCount : 0;

        emit GameEnded(gameId, outcome, game.round, winnerCount, game.shareStreak);
        emit PhaseAdvanced(gameId, Phase.Ended);
    }

    function _cancelGame(uint256 gameId, GameSnapshot storage game) internal {
        game.phase = Phase.Cancelled;
        game.outcome = Outcome.Cancelled;

        _finalizeCancelledSettlement(gameId, game);

        if (activeGameId == gameId) {
            activeGameId = 0;
        }

        emit GameCancelled(gameId);
        emit PhaseAdvanced(gameId, Phase.Cancelled);
    }

    function _finalizeEndedSettlement(uint256 gameId, GameSnapshot storage game, Outcome outcome) internal {
        SettlementState storage settlement = _settlements[gameId];
        if (settlement.finalized) revert SettlementAlreadyFinalized();

        uint256 totalPotWei = game.entryFeeWei * uint256(game.joinedCount);
        uint256 creatorFeeWei = totalPotWei * uint256(game.creatorFeeBps) / BPS_DENOMINATOR;
        uint256 postCreatorPotWei = totalPotWei - creatorFeeWei;

        settlement.totalPotWei = totalPotWei;
        settlement.creatorFeeWei = creatorFeeWei;
        settlement.finalized = true;

        if (outcome == Outcome.Winners) {
            uint16 winnerCount = game.aliveCount;
            if (winnerCount == 0) revert InvalidResolutionState();

            uint256 winnerShareWei = postCreatorPotWei / uint256(winnerCount);
            uint256 treasuryAccruedWei = creatorFeeWei + (postCreatorPotWei - (winnerShareWei * uint256(winnerCount)));

            settlement.treasuryAccruedWei = treasuryAccruedWei;
            settlement.winnerShareWei = winnerShareWei;
            settlement.winnerCount = winnerCount;

            if (treasuryAccruedWei != 0) {
                emit TreasuryAccrued(gameId, game.treasury, treasuryAccruedWei);
            }

            emit SettlementFinalized(
                gameId, outcome, totalPotWei, creatorFeeWei, winnerCount, winnerShareWei, 0, 0, treasuryAccruedWei
            );
            return;
        }

        if (outcome == Outcome.NoWinners) {
            uint256 noWinnerCausePoolWei = postCreatorPotWei * NO_WINNER_CAUSE_BPS / BPS_DENOMINATOR;
            uint256 distributedCauseWei = _distributeNoWinnerCausePool(gameId, game.joinedCount, noWinnerCausePoolWei);
            uint256 treasuryAccruedWei = totalPotWei - distributedCauseWei;

            settlement.treasuryAccruedWei = treasuryAccruedWei;
            settlement.noWinnerCausePoolWei = noWinnerCausePoolWei;
            settlement.noWinnerCauseDistributedWei = distributedCauseWei;

            if (treasuryAccruedWei != 0) {
                emit TreasuryAccrued(gameId, game.treasury, treasuryAccruedWei);
            }

            emit SettlementFinalized(
                gameId, outcome, totalPotWei, creatorFeeWei, 0, 0, 0, noWinnerCausePoolWei, treasuryAccruedWei
            );
            return;
        }

        revert InvalidResolutionState();
    }

    function _distributeNoWinnerCausePool(uint256 gameId, uint16 joinedCount, uint256 noWinnerCausePoolWei)
        internal
        returns (uint256 distributedCauseWei)
    {
        if (joinedCount == 0 || noWinnerCausePoolWei == 0) return 0;

        uint16[] storage causeIds = _gameCauseIds[gameId];
        uint256 causeIdsLength = causeIds.length;

        for (uint256 index = 0; index < causeIdsLength; ++index) {
            uint16 causeId = causeIds[index];
            GameCauseState storage causeState = _gameCauses[gameId][causeId];
            uint256 causeAmountWei = noWinnerCausePoolWei * uint256(causeState.entrantCount) / uint256(joinedCount);

            distributedCauseWei += causeAmountWei;
            _gameCauseRoutedWei[gameId][causeId] += causeAmountWei;

            if (causeAmountWei != 0) {
                emit NoWinnerDistributed(gameId, causeId, causeState.recipient, causeAmountWei);
            }
        }
    }

    function _finalizeCancelledSettlement(uint256 gameId, GameSnapshot storage game) internal {
        SettlementState storage settlement = _settlements[gameId];
        if (settlement.finalized) revert SettlementAlreadyFinalized();

        settlement.totalPotWei = game.entryFeeWei * uint256(game.joinedCount);
        settlement.refundPerPlayerWei = game.entryFeeWei;
        settlement.finalized = true;

        emit SettlementFinalized(
            gameId, Outcome.Cancelled, settlement.totalPotWei, 0, 0, 0, settlement.refundPerPlayerWei, 0, 0
        );
    }

    function _claimPrize(uint256 gameId, address winner, address recipient) internal {
        GameSnapshot storage game = _games[gameId];
        if (!_gameExists(gameId)) revert MissingGame();
        if (game.phase != Phase.Ended || game.outcome != Outcome.Winners) revert ClaimUnavailable();

        PlayerState storage player = _players[gameId][winner];
        if (!player.joined) revert PlayerNotJoined();
        if (!player.alive) revert ClaimUnavailable();
        if (player.claimed) revert AlreadyClaimed();
        if (player.refunded) revert AlreadyRefunded();

        SettlementState memory settlement = _settlements[gameId];
        if (!settlement.finalized || settlement.winnerCount == 0) revert ClaimUnavailable();

        player.claimed = true;

        uint256 grossPrizeWei = settlement.winnerShareWei;
        GameCauseState storage causeState = _gameCauses[gameId][player.causeId];
        uint256 causeCutWei = grossPrizeWei * uint256(game.causeFeeBps) / BPS_DENOMINATOR;
        uint256 netPrizeWei = grossPrizeWei - causeCutWei;

        if (causeCutWei != 0) {
            _gameCauseRoutedWei[gameId][player.causeId] += causeCutWei;
        }

        _decreaseAccountedETHLiability(netPrizeWei);
        _payout(recipient, netPrizeWei);

        emit PrizeClaimed(gameId, winner, player.causeId, grossPrizeWei, causeCutWei, netPrizeWei, causeState.recipient);
    }

    function _payout(address recipient, uint256 amountWei) internal {
        if (amountWei == 0) return;
        if (recipient == address(0)) revert InvalidRecipient();

        (bool success,) = recipient.call{ value: amountWei }("");
        if (!success) revert TransferFailed();
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

    function _increaseAccountedETHLiability(uint256 amountWei) internal {
        _accountedETHLiabilities += amountWei;
    }

    function _decreaseAccountedETHLiability(uint256 amountWei) internal {
        if (amountWei == 0) return;
        _accountedETHLiabilities -= amountWei;
    }

    function _liveGameActive() internal view returns (bool) {
        if (activeGameId == 0) return false;

        Phase phase = _games[activeGameId].phase;
        return phase == Phase.Joining || phase == Phase.Commit || phase == Phase.Reveal;
    }

    function _isAuthorized(address wallet) internal view returns (bool) {
        return IAgentAuthRegistry(authRegistry).isAuthorized(wallet);
    }

    function _gameExists(uint256 gameId) internal view returns (bool) {
        return gameId != 0 && _games[gameId].createdAt != 0;
    }
}
