using Microsoft.AspNetCore.SignalR;

namespace Feudopoly.Server.Multiplayer;

public interface IDiceRoller
{
    int Roll();
}

public sealed class RandomDiceRoller : IDiceRoller
{
    public int Roll() => Random.Shared.Next(1, 7);
}

/// <summary>
/// Turn rules engine. Every public method mutates <see cref="GameSession"/> and expects the caller to hold <c>lock (session)</c>.
/// </summary>
public sealed class GameEngine(SessionStorage sessionStorage, EventStorage eventStorage, IDiceRoller dice)
{
    public const int BoardCellsCount = 30;

    // Server-side fallbacks for clients that stopped acting (hidden tab, frozen client, never connected).
    // Clients auto-act after AUTO_TURN_TIMEOUT_MS (30s), so these leave room for animations and videos.
    public static readonly TimeSpan RollTimeout = TimeSpan.FromSeconds(60);
    public static readonly TimeSpan TurnResolutionTimeout = TimeSpan.FromSeconds(90);
    public static readonly TimeSpan EventRollTimeout = TimeSpan.FromSeconds(60);
    public static readonly TimeSpan GameStartGrace = TimeSpan.FromSeconds(60);
    // Phaser doesn't switch scenes in a background tab, so a player who tabbed away at launch joins only when they
    // come back. Until then their turns are auto-played; after this they count as gone for good.
    public static readonly TimeSpan JoinTimeout = TimeSpan.FromMinutes(3);

    public IReadOnlyDictionary<int, GameCellEvent> Events => eventStorage.Events;

    public void JoinPlayer(GameSession session, PlayerState player, string connectionId)
    {
        player.ConnectionId = connectionId;
        player.IsConnected = true;
        sessionStorage.MarkInProgress(session);

        if (session.ActionDeadlineUtc is null && session.Status == LobbyStatus.InProgress)
        {
            RefreshActionDeadline(session, GameStartGrace);
        }
    }

    public RollResult Roll(GameSession session, PlayerState caller)
    {
        ValidateTurnCaller(session, caller);

        var rolled = dice.Roll();
        session.LastRollValue = rolled;

        RollResult result;
        if (session.IsEventRollPhase)
        {
            if (!session.PendingEventRollPlayerIds.Contains(caller.PlayerId))
            {
                throw new HubException("You are not waiting for an event roll.");
            }

            var gameEvent = session.PendingEventRollEvent ?? throw new HubException("No pending roll event.");
            var outcome = gameEvent.RollOutcomes.FirstOrDefault(r => r.Range.InRange(rolled))?.Outcome
                          ?? throw new HubException("No roll range matched outcome.");

            var repeatTurn = false;
            ApplyOutcome(caller, outcome, ref repeatTurn);
            var entries = new List<ResolvedOutcomeEntry> { new(caller.PlayerId, rolled, outcome) };

            var gameCompleted = false;
            session.PendingEventRollPlayerIds.Remove(caller.PlayerId);
            if (session.PendingEventRollPlayerIds.Count == 0)
            {
                EndEventRollPhase(session);
                gameCompleted = CompleteGameIfNoActivePlayers(session);
                if (!gameCompleted && !repeatTurn)
                {
                    AdvanceTurn(session);
                }
            }

            result = new RollResult
            {
                PlayerId = caller.PlayerId,
                Rolled = rolled,
                NewPosition = caller.Position,
                IsEventPhaseRoll = true,
                CompletedWinningLap = false,
                GameCompleted = gameCompleted,
                PhaseResolution = new TurnResolutionPayload
                {
                    PlayerId = caller.PlayerId,
                    Event = gameEvent,
                    Entries = entries,
                    RepeatTurn = repeatTurn,
                    IsEventRollPhase = true,
                    EventRollCompleted = !session.IsEventRollPhase
                }
            };
        }
        else
        {
            if (session.IsTurnInProgress)
            {
                throw new HubException("Turn is not finished yet.");
            }

            if (caller.TurnsToSkip > 0 && !TryConsumeSoloSkipPenalty(session, caller))
            {
                throw new HubException($"You must skip {caller.TurnsToSkip} more turn(s).");
            }

            var completedWinningLap = MovePlayerByOffset(caller, rolled);
            var gameCompleted = false;

            if (completedWinningLap)
            {
                gameCompleted = CompleteGameIfNoActivePlayers(session);
                if (!gameCompleted)
                {
                    AdvanceTurn(session);
                }
            }
            else
            {
                session.IsTurnInProgress = true;
            }

            result = new RollResult
            {
                PlayerId = caller.PlayerId,
                Rolled = rolled,
                NewPosition = caller.Position,
                IsEventPhaseRoll = false,
                CompletedWinningLap = completedWinningLap,
                GameCompleted = gameCompleted,
                PhaseResolution = null
            };
        }

        RefreshActionDeadline(session);
        return result;
    }

    public GameCellEvent BeginTurn(GameSession session, PlayerState caller)
    {
        ValidateTurnCaller(session, caller);
        if (!session.IsTurnInProgress)
        {
            throw new HubException("Turn is already completed.");
        }

        return GetCellEvent(caller.Position);
    }

    /// <param name="autoPickTarget">When true, a missing chosen player is picked at random instead of failing (server timeout).</param>
    public FinishTurnResult FinishTurn(GameSession session, PlayerState caller, Guid? chosenPlayerId, bool autoPickTarget = false)
    {
        ValidateTurnCaller(session, caller);
        if (!session.IsTurnInProgress)
        {
            throw new HubException("Turn isn't started.");
        }

        var cellEvent = GetCellEvent(caller.Position);
        TurnResolutionPayload resolution;
        var gameCompleted = false;

        if (TryStartEventRollPhase(session, caller, cellEvent))
        {
            session.IsTurnInProgress = false;

            resolution = new TurnResolutionPayload
            {
                PlayerId = caller.PlayerId,
                Event = cellEvent,
                Entries = [],
                RepeatTurn = false,
                IsEventRollPhase = true,
                EventRollCompleted = false
            };
        }
        else
        {
            if (autoPickTarget && chosenPlayerId is null)
            {
                chosenPlayerId = PickRandomChosenTarget(session, caller);
            }

            resolution = ResolveEvent(session, caller, cellEvent, chosenPlayerId);
            session.IsTurnInProgress = false;

            gameCompleted = CompleteGameIfNoActivePlayers(session);
            if (!gameCompleted && !resolution.RepeatTurn)
            {
                AdvanceTurn(session);
            }
        }

        RefreshActionDeadline(session);
        return new FinishTurnResult(resolution, gameCompleted);
    }

    public RemovePlayerResult RemovePlayer(GameSession session, PlayerState player)
    {
        var removedPlayerIndex = session.Players.FindIndex(item => item.PlayerId == player.PlayerId);
        var wasActiveTurnPlayer = player.PlayerId == session.ActiveTurnPlayerId;
        var wasEventRollPhase = session.IsEventRollPhase;

        var removedSession = sessionStorage.RemovePlayerFromSession(session, player.PlayerId);
        if (removedSession)
        {
            return new RemovePlayerResult(SessionRemoved: true, GameCompleted: false);
        }

        if (wasActiveTurnPlayer)
        {
            // The leaver may have rolled already; nobody else can finish that turn.
            session.IsTurnInProgress = false;

            SetTurnCursorBeforeRemovedPlayer(session, removedPlayerIndex);
        }

        if (wasEventRollPhase)
        {
            if (session.PendingEventRollPlayerIds.Count == 0)
            {
                EndEventRollPhase(session);
                AdvanceTurn(session);
            }
        }
        else if (wasActiveTurnPlayer || !HasReadyActiveTurnPlayer(session))
        {
            AdvanceTurn(session);
        }

        var gameCompleted = session.Status == LobbyStatus.InProgress && CompleteGameIfNoActivePlayers(session);
        RefreshActionDeadline(session);
        return new RemovePlayerResult(SessionRemoved: false, GameCompleted: gameCompleted);
    }

    public void ValidateTurnCaller(GameSession session, PlayerState caller)
    {
        if (session.Players.Count == 0)
        {
            throw new HubException("No players in session.");
        }

        if (session.IsEventRollPhase)
        {
            if (!IsActiveParticipant(caller))
            {
                throw new HubException("Dead or spectator players can't make turns.");
            }

            if (!session.PendingEventRollPlayerIds.Contains(caller.PlayerId))
            {
                throw new HubException("Waiting for other players to roll.");
            }

            return;
        }

        if (session.ActiveTurnPlayerId == Guid.Empty)
        {
            var nextActive = session.Players.FirstOrDefault(IsActiveParticipant)
                ?? throw new HubException("No active players left in session.");

            session.ActiveTurnPlayerId = nextActive.PlayerId;
        }

        if (caller.PlayerId != session.ActiveTurnPlayerId)
        {
            throw new HubException("Not your turn.");
        }

        if (!IsActiveParticipant(caller))
        {
            throw new HubException("Dead or spectator players can't make turns.");
        }
    }

    public static bool IsActiveParticipant(PlayerState player) => !player.IsDead && !player.IsSpectator && !player.IsWinner;

    public static void RefreshActionDeadline(GameSession session, TimeSpan? extra = null)
    {
        if (session.Status != LobbyStatus.InProgress)
        {
            session.ActionDeadlineUtc = null;
            return;
        }

        var timeout = session.IsEventRollPhase
            ? EventRollTimeout
            : session.IsTurnInProgress ? TurnResolutionTimeout : RollTimeout;

        session.ActionDeadlineUtc = DateTime.UtcNow + timeout + (extra ?? TimeSpan.Zero);
    }

    public static GameCompletionPayload CreateGameCompletionPayload(GameStateDto state)
    {
        var winnerPlayerIds = state.Players
            .Where(player => player.IsWinner)
            .Select(player => player.PlayerId)
            .ToArray();

        return new GameCompletionPayload
        {
            State = state,
            Reason = "NoActivePlayers",
            WinnerPlayerIds = winnerPlayerIds,
            Message = winnerPlayerIds.Length > 0
                ? "The game has ended."
                : "The game has ended. No active players remain."
        };
    }

    internal static int NormalizePosition(int position)
    {
        var normalized = position % BoardCellsCount;
        return normalized < 0 ? normalized + BoardCellsCount : normalized;
    }

    internal static bool MovePlayerByOffset(PlayerState player, int moveOffset)
    {
        if (HasCompletedWinningLap(player.Position, moveOffset))
        {
            MarkPlayerAsWinner(player);
            return true;
        }

        // The rules don't say what happens when moving back past the start; the player stops on the start field
        // instead of wrapping around to the end of the board (which would put them one roll away from winning).
        player.Position = Math.Max(0, player.Position + moveOffset);
        return false;
    }

    internal static void AdvanceTurn(GameSession session)
    {
        var activePlayers = session.Players.Where(IsActiveParticipant).ToList();
        if (activePlayers.Count == 0)
        {
            session.ActiveTurnPlayerId = Guid.Empty;
            return;
        }

        var currentIndex = session.Players.FindIndex(p => p.PlayerId == session.ActiveTurnPlayerId);
        if (currentIndex < 0)
        {
            currentIndex = -1;
        }

        var maxSkips = activePlayers.Max(player => player.TurnsToSkip);
        var maxAttempts = session.Players.Count * (maxSkips + 1);

        for (var offset = 1; offset <= maxAttempts; offset++)
        {
            var next = session.Players[(currentIndex + offset) % session.Players.Count];
            if (!IsActiveParticipant(next))
            {
                continue;
            }

            if (next.TurnsToSkip > 0)
            {
                next.TurnsToSkip--;
                continue;
            }

            session.ActiveTurnPlayerId = next.PlayerId;
            return;
        }

        var fallback = activePlayers[0];
        fallback.TurnsToSkip = 0;
        session.ActiveTurnPlayerId = fallback.PlayerId;
    }

    internal static void ApplyOutcome(PlayerState player, EventOutcome outcome, ref bool repeatTurn)
    {
        if (!IsActiveParticipant(player))
        {
            return;
        }

        switch (outcome.Kind)
        {
            case OutcomeKind.None:
                return;
            case OutcomeKind.MoveByOffset:
                MovePlayerByOffset(player, outcome.MoveOffset);
                return;
            case OutcomeKind.MoveToCell:
                if (outcome.MoveToCell is int cell)
                {
                    player.Position = NormalizePosition(cell);
                }
                return;
            case OutcomeKind.RepeatRoll:
                repeatTurn = true;
                return;
            case OutcomeKind.SkipTurns:
                player.TurnsToSkip += Math.Max(0, outcome.SkipTurns);
                return;
            case OutcomeKind.Eliminate:
                player.IsDead = true;
                player.TurnsToSkip = 0;
                return;
            default:
                throw new ArgumentOutOfRangeException();
        }
    }

    private GameCellEvent GetCellEvent(int position)
    {
        if (!eventStorage.Events.TryGetValue(position, out var cellEvent))
        {
            throw new HubException($"Event for {position} position does not exist!");
        }

        return cellEvent;
    }

    private static bool TryStartEventRollPhase(GameSession session, PlayerState currentPlayer, GameCellEvent gameEvent)
    {
        var participants = GetSelfResolvedEventRollParticipants(session, currentPlayer, gameEvent);
        if (participants.Count == 0)
        {
            return false;
        }

        session.IsEventRollPhase = true;
        session.EventRollOwnerPlayerId = currentPlayer.PlayerId;
        session.PendingEventRollEvent = gameEvent;
        session.PendingEventRollPlayerIds.Clear();
        session.PendingEventRollPlayerIds.AddRange(participants);
        return true;
    }

    private static IReadOnlyList<Guid> GetSelfResolvedEventRollParticipants(GameSession session, PlayerState currentPlayer, GameCellEvent gameEvent)
    {
        if (gameEvent.ResolutionMode != EventResolutionMode.Roll || gameEvent.RollOutcomes.Count == 0)
        {
            return [];
        }

        var targetScopes = gameEvent.RollOutcomes
            .Select(item => item.Outcome.Target)
            .Distinct()
            .ToList();

        if (targetScopes.Count != 1)
        {
            return [];
        }

        return targetScopes[0] switch
        {
            OutcomeTarget.CurrentPlayer => [currentPlayer.PlayerId],
            OutcomeTarget.AllPlayers => session.Players
                .Where(IsActiveParticipant)
                .Select(player => player.PlayerId)
                .ToArray(),
            OutcomeTarget.Women => session.Players
                .Where(player => player.IsWomen && IsActiveParticipant(player))
                .Select(player => player.PlayerId)
                .ToArray(),
            OutcomeTarget.Muslims => session.Players
                .Where(player => player.IsMuslim && IsActiveParticipant(player))
                .Select(player => player.PlayerId)
                .ToArray(),
            OutcomeTarget.NonMuslims => session.Players
                .Where(player => !player.IsMuslim && IsActiveParticipant(player))
                .Select(player => player.PlayerId)
                .ToArray(),
            _ => []
        };
    }

    private static void EndEventRollPhase(GameSession session)
    {
        session.IsEventRollPhase = false;
        session.PendingEventRollEvent = null;
        session.PendingEventRollPlayerIds.Clear();
        session.EventRollOwnerPlayerId = Guid.Empty;
    }

    private static bool CompleteGameIfNoActivePlayers(GameSession session)
    {
        if (session.Players.Any(IsActiveParticipant))
        {
            return false;
        }

        session.Status = LobbyStatus.Completed;
        session.ActiveTurnPlayerId = Guid.Empty;
        session.IsTurnInProgress = false;
        EndEventRollPhase(session);
        return true;
    }

    private static void SetTurnCursorBeforeRemovedPlayer(GameSession session, int removedPlayerIndex)
    {
        if (session.Players.Count == 0)
        {
            session.ActiveTurnPlayerId = Guid.Empty;
            return;
        }

        var cursorIndex = removedPlayerIndex <= 0
            ? session.Players.Count - 1
            : Math.Min(removedPlayerIndex - 1, session.Players.Count - 1);

        session.ActiveTurnPlayerId = session.Players[cursorIndex].PlayerId;
    }

    private static bool HasReadyActiveTurnPlayer(GameSession session)
    {
        var activePlayer = session.Players.FirstOrDefault(player => player.PlayerId == session.ActiveTurnPlayerId);
        return activePlayer is not null && IsActiveParticipant(activePlayer) && activePlayer.TurnsToSkip == 0;
    }

    private static bool HasCompletedWinningLap(int startPosition, int rolled)
        => rolled > 0 && startPosition + rolled >= BoardCellsCount;

    private static void MarkPlayerAsWinner(PlayerState player)
    {
        player.Position = 0;
        player.IsWinner = true;
        player.TurnsToSkip = 0;
    }

    private static bool TryConsumeSoloSkipPenalty(GameSession session, PlayerState player)
    {
        if (player.TurnsToSkip <= 0)
        {
            return false;
        }

        var activeParticipantsCount = session.Players.Count(IsActiveParticipant);
        if (activeParticipantsCount != 1)
        {
            return false;
        }

        player.TurnsToSkip = 0;
        session.ActiveTurnPlayerId = player.PlayerId;
        return true;
    }

    private TurnResolutionPayload ResolveEvent(GameSession session, PlayerState currentPlayer, GameCellEvent gameEvent, Guid? chosenPlayerId)
    {
        var entries = new List<ResolvedOutcomeEntry>();
        var repeatTurn = false;

        if (gameEvent.ResolutionMode == EventResolutionMode.Fixed)
        {
            foreach (var outcome in gameEvent.FixedOutcomes)
            {
                var targets = ResolveTargets(session, currentPlayer, outcome.Target, chosenPlayerId);
                foreach (var target in targets)
                {
                    ApplyOutcome(target, outcome, ref repeatTurn);
                    entries.Add(new ResolvedOutcomeEntry(target.PlayerId, 0, outcome));
                }
            }
        }
        else
        {
            var targetScopes = gameEvent.RollOutcomes.Select(r => r.Outcome.Target).Distinct().ToList();
            if (targetScopes.Count == 0)
            {
                throw new HubException("Roll event has no outcomes.");
            }

            var allTargets = targetScopes
                .SelectMany(scope => ResolveTargets(session, currentPlayer, scope, chosenPlayerId))
                .DistinctBy(p => p.PlayerId)
                .ToList();

            foreach (var target in allTargets)
            {
                var roll = dice.Roll();
                var outcome = gameEvent.RollOutcomes.FirstOrDefault(r => r.Range.InRange(roll))?.Outcome
                              ?? throw new HubException("No roll range matched outcome.");

                ApplyOutcome(target, outcome, ref repeatTurn);
                entries.Add(new ResolvedOutcomeEntry(target.PlayerId, roll, outcome));
            }
        }

        return new TurnResolutionPayload
        {
            PlayerId = currentPlayer.PlayerId,
            Event = gameEvent,
            Entries = entries,
            RepeatTurn = repeatTurn,
            IsEventRollPhase = false,
            EventRollCompleted = false
        };
    }

    private static IEnumerable<PlayerState> ResolveTargets(GameSession session, PlayerState currentPlayer, OutcomeTarget target, Guid? chosenPlayerId)
    {
        return target switch
        {
            OutcomeTarget.CurrentPlayer => [currentPlayer],
            OutcomeTarget.ChosenPlayer => ResolveChosenPlayerTargets(session, currentPlayer, chosenPlayerId),
            OutcomeTarget.AllPlayers => session.Players.Where(IsActiveParticipant),
            OutcomeTarget.Women => session.Players.Where(p => p.IsWomen && IsActiveParticipant(p)),
            OutcomeTarget.Muslims => session.Players.Where(p => p.IsMuslim && IsActiveParticipant(p)),
            OutcomeTarget.NonMuslims => session.Players.Where(p => !p.IsMuslim && IsActiveParticipant(p)),
            _ => throw new ArgumentOutOfRangeException(nameof(target), target, null)
        };
    }

    private static List<PlayerState> GetChosenPlayerCandidates(GameSession session, PlayerState currentPlayer) =>
        session.Players
            .Where(p => p.PlayerId != currentPlayer.PlayerId && IsActiveParticipant(p))
            .ToList();

    private static Guid? PickRandomChosenTarget(GameSession session, PlayerState currentPlayer)
    {
        var candidates = GetChosenPlayerCandidates(session, currentPlayer);
        return candidates.Count == 0 ? null : candidates[Random.Shared.Next(candidates.Count)].PlayerId;
    }

    private static IEnumerable<PlayerState> ResolveChosenPlayerTargets(GameSession session, PlayerState currentPlayer, Guid? chosenPlayerId)
    {
        var candidates = GetChosenPlayerCandidates(session, currentPlayer);

        if (candidates.Count == 0)
        {
            return [];
        }

        if (chosenPlayerId.HasValue)
        {
            var chosen = candidates.FirstOrDefault(p => p.PlayerId == chosenPlayerId.Value);
            if (chosen is not null)
            {
                return [chosen];
            }

            throw new HubException("Chosen player is not a valid target.");
        }

        if (candidates.Count == 1)
        {
            return [candidates[0]];
        }

        throw new HubException("Choose a player.");
    }
}

public sealed record RollResult
{
    public required Guid PlayerId { get; init; }
    public required int Rolled { get; init; }
    public required int NewPosition { get; init; }
    public required bool IsEventPhaseRoll { get; init; }
    public required bool CompletedWinningLap { get; init; }
    public required bool GameCompleted { get; init; }
    public required TurnResolutionPayload? PhaseResolution { get; init; }
}

public sealed record FinishTurnResult(TurnResolutionPayload Resolution, bool GameCompleted);

public sealed record RemovePlayerResult(bool SessionRemoved, bool GameCompleted);

public sealed record TurnResolutionPayload
{
    /// <summary>The player whose action produced this resolution.</summary>
    public required Guid PlayerId { get; init; }
    public required GameCellEvent Event { get; init; }
    public required IReadOnlyList<ResolvedOutcomeEntry> Entries { get; init; }
    public required bool RepeatTurn { get; init; }
    public required bool IsEventRollPhase { get; init; }
    public required bool EventRollCompleted { get; init; }
}

public sealed record ResolvedOutcomeEntry(Guid PlayerId, int Roll, EventOutcome Outcome);

public sealed record GameCompletionPayload
{
    public required GameStateDto State { get; init; }
    public required string Reason { get; init; }
    public required IReadOnlyList<Guid> WinnerPlayerIds { get; init; }
    public required string Message { get; init; }
}
