using Feudopoly.Server.Multiplayer;
using Microsoft.AspNetCore.SignalR;

namespace Feudopoly.Server.Hubs;

public sealed class GameHub(SessionStorage _sessionStore, EventStorage _eventStorage, ILogger<GameHub> logger) : Hub
{
    private const int BoardCellsCount = 30;
    private const int MaxPlayers = 4;
    private const string SessionIdContextKey = "sessionId";

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        if (!TryGetSessionId(out var sessionId))
        {
            logger.LogDebug("Connection {ConnectionId} disconnected without a tracked session", Context.ConnectionId);
            await base.OnDisconnectedAsync(exception);
            return;
        }

        if (!_sessionStore.TryGetSession(sessionId, out var session) || session is null)
        {
            logger.LogDebug("Connection {ConnectionId} disconnected from missing session {SessionId}", Context.ConnectionId, sessionId);
            await base.OnDisconnectedAsync(exception);
            return;
        }

        PlayerState? removedPlayer;
        GameStateDto state;

        lock (session)
        {
            removedPlayer = session.Players.FirstOrDefault(player => player.ConnectionId == Context.ConnectionId);
            if (removedPlayer is null)
            {
                state = SessionStorage.ToDto(session);
            }
            else
            {
                var wasActive = removedPlayer.PlayerId == session.ActiveTurnPlayerId;
                session.Players.Remove(removedPlayer);

                if (session.IsEventRollPhase)
                {
                    session.PendingEventRollPlayerIds.Remove(removedPlayer.PlayerId);
                    if (session.PendingEventRollPlayerIds.Count == 0)
                    {
                        CompleteEventRollPhase(session);
                    }
                }
                else if (session.Players.Count == 0)
                {
                    session.ActiveTurnPlayerId = Guid.Empty;
                    session.IsTurnInProgress = false;
                }
                else if (wasActive)
                {
                    AdvanceTurn(session);
                }

                state = SessionStorage.ToDto(session);
            }
        }

        string groupName = sessionId.ToString();

        if (removedPlayer is not null)
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, groupName);
            await Clients.Group(groupName).SendAsync("PlayerLeft", removedPlayer.PlayerId);
            await Clients.Group(groupName).SendAsync("StateUpdated", state);
            _sessionStore.RemoveSessionIfEmpty(sessionId);

            logger.LogInformation("Player {PlayerName}:{PlayerId} disconnected session {SessionId}", removedPlayer.DisplayName, removedPlayer.PlayerId, sessionId);
        }

        await base.OnDisconnectedAsync(exception);
    }

    public async Task JoinGame(Guid? sessionId, string displayName, bool isMan, bool isMuslim)
    {
        logger.LogInformation(
            "JoinGame requested by connection {ConnectionId} for session {SessionId} with display name '{DisplayName}'",
            Context.ConnectionId,
            sessionId,
            displayName);

        if (sessionId is null || sessionId == Guid.Empty)
        {
            throw new HubException("Session id is required.");
        }

        if (string.IsNullOrWhiteSpace(displayName))
        {
            throw new InvalidDataException("Display name is required.");
        }

        displayName = displayName.Trim();
        var session = _sessionStore.GetOrCreateSession(sessionId.Value);

        PlayerState joinedPlayer;
        GameStateDto state;

        lock (session)
        {
            if (session.Players.Count >= MaxPlayers)
            {
                throw new HubException("Game session is full.");
            }

            joinedPlayer = new PlayerState
            {
                ConnectionId = Context.ConnectionId,
                PlayerId = Guid.NewGuid(),
                DisplayName = displayName,
                IsMan = isMan,
                IsMuslim = isMuslim,
                Position = 0,
                IsConnected = true,
                IsDead = false,
                TurnsToSkip = 0
            };

            session.Players.Add(joinedPlayer);
            state = SessionStorage.ToDto(session);
        }

        Context.Items[SessionIdContextKey] = sessionId;

        string groupName = sessionId.Value.ToString();
        await Groups.AddToGroupAsync(Context.ConnectionId, groupName);
        await Clients.Caller.SendAsync("Joined", joinedPlayer.PlayerId, state);
        await Clients.OthersInGroup(groupName).SendAsync("PlayerJoined", SessionStorage.ToDto(session));
        await Clients.Group(groupName).SendAsync("StateUpdated", state);

        logger.LogInformation(
            "Player {PlayerName}:{PlayerId} joined session {SessionId}. Players in session: {PlayerCount}",
            joinedPlayer.DisplayName,
            joinedPlayer.PlayerId,
            sessionId,
            state.Players.Count);
    }

    public async Task RollDice(Guid sessionId)
    {
        logger.LogDebug("RollDice requested by connection {ConnectionId} for session {SessionId}", Context.ConnectionId, sessionId);

        if (!_sessionStore.TryGetSession(sessionId, out var session) || session is null)
        {
            throw new HubException("Session not found.");
        }

        PlayerState caller;
        int rolled;
        int newPosition;
        bool isEventPhaseRoll;
        TurnResolutionPayload? phaseResolution = null;
        GameStateDto state;

        lock (session)
        {
            caller = ValidateCallerAndGetCurrent(session);
            rolled = Random.Shared.Next(1, 7);
            session.LastRollValue = rolled;

            if (session.IsEventRollPhase)
            {
                if (!session.PendingEventRollPlayerIds.Contains(caller.PlayerId))
                {
                    throw new HubException("You are not waiting for an event roll.");
                }

                var gameEvent = session.PendingEventRollEvent ?? throw new HubException("No pending roll event.");
                var outcome = gameEvent.RollOutcomes.FirstOrDefault(r => r.Range.InRange(rolled))?.Outcome
                              ?? throw new HubException("No roll range matched outcome.");

                var entries = new List<ResolvedOutcomeEntry>();
                var repeatTurn = false;
                ApplyOutcome(caller, outcome, ref repeatTurn);
                entries.Add(new ResolvedOutcomeEntry(caller.PlayerId, rolled, outcome));

                session.PendingEventRollPlayerIds.Remove(caller.PlayerId);
                if (session.PendingEventRollPlayerIds.Count == 0)
                {
                    CompleteEventRollPhase(session);
                }

                newPosition = caller.Position;
                isEventPhaseRoll = true;
                phaseResolution = new TurnResolutionPayload
                {
                    Event = gameEvent,
                    Entries = entries,
                    RepeatTurn = false,
                    IsEventRollPhase = true,
                    EventRollCompleted = !session.IsEventRollPhase
                };
            }
            else
            {
                if (session.IsTurnInProgress)
                {
                    throw new HubException("Turn is not finished yet.");
                }

                if (caller.TurnsToSkip > 0)
                {
                    throw new HubException($"You must skip {caller.TurnsToSkip} more turn(s).");
                }

                caller.Position = NormalizePosition(caller.Position + rolled);
                session.IsTurnInProgress = true;
                newPosition = caller.Position;
                isEventPhaseRoll = false;
            }

            state = SessionStorage.ToDto(session);
        }

        string groupName = sessionId.ToString();
        var rollPayload = new { playerId = caller.PlayerId, rollValue = rolled, newPosition };
        if (isEventPhaseRoll)
        {
            await Clients.Caller.SendAsync("EventDiceRolled", rollPayload);
        }
        else
        {
            await Clients.Caller.SendAsync("DiceRolled", rollPayload);
        }

        if (phaseResolution is not null)
        {
            await Clients.Caller.SendAsync("TurnEnded", phaseResolution);
        }

        await Clients.Group(groupName).SendAsync("StateUpdated", state);

        logger.LogInformation(
            "Player {PlayerId} rolled {RollValue} in session {SessionId}. EventPhase: {IsEventPhase}. NewPosition: {NewPosition}",
            caller.PlayerId,
            rolled,
            sessionId,
            isEventPhaseRoll,
            newPosition);
    }

    public async Task BeginTurn(Guid sessionId)
    {
        logger.LogDebug("BeginTurn requested by connection {ConnectionId} for session {SessionId}", Context.ConnectionId, sessionId);

        if (!_sessionStore.TryGetSession(sessionId, out var session) || session is null)
        {
            throw new HubException("Session not found.");
        }

        GameStateDto state;
        GameCellEvent cellEvent;

        lock (session)
        {
            var caller = ValidateCallerAndGetCurrent(session);
            if (!session.IsTurnInProgress)
            {
                throw new HubException("Turn is already completed.");
            }

            if (!_eventStorage.Events.TryGetValue(caller.Position, out cellEvent!))
            {
                throw new HubException($"Event for {caller.Position} position does not exist!");
            }

            state = SessionStorage.ToDto(session);
        }

        string groupName = sessionId.ToString();
        await Clients.Group(groupName).SendAsync("StateUpdated", state);
        await Clients.Caller.SendAsync("TurnBegan", cellEvent);

        logger.LogInformation(
            "Turn began in session {SessionId} for connection {ConnectionId} on event '{EventTitle}'",
            sessionId,
            Context.ConnectionId,
            cellEvent.Title);
    }

    public async Task FinishTurn(Guid sessionId, Guid? chosenPlayerId = null)
    {
        logger.LogDebug("FinishTurn requested by connection {ConnectionId} for session {SessionId}", Context.ConnectionId, sessionId);

        if (!_sessionStore.TryGetSession(sessionId, out var session) || session is null)
        {
            throw new HubException("Session not found.");
        }

        GameStateDto state;
        GameCellEvent cellEvent;
        TurnResolutionPayload resolution;

        lock (session)
        {
            var caller = ValidateCallerAndGetCurrent(session);
            if (!session.IsTurnInProgress)
            {
                throw new HubException("Turn isn't started.");
            }

            if (!_eventStorage.Events.TryGetValue(caller.Position, out cellEvent!))
            {
                throw new HubException($"Event for {caller.Position} position does not exist!");
            }

            resolution = ResolveEvent(session, caller, cellEvent, chosenPlayerId);

            if (ShouldStartEventRollPhase(session, cellEvent, resolution))
            {
                StartEventRollPhase(session, caller.PlayerId, cellEvent);
                session.IsTurnInProgress = false;
                resolution = resolution with { IsEventRollPhase = true, EventRollCompleted = false, RepeatTurn = false };
            }
            else
            {
                session.IsTurnInProgress = false;
                if (!resolution.RepeatTurn)
                {
                    AdvanceTurn(session);
                }
            }

            state = SessionStorage.ToDto(session);
        }

        string groupName = sessionId.ToString();
        await Clients.Group(groupName).SendAsync("StateUpdated", state);
        await Clients.Caller.SendAsync("TurnEnded", resolution);

        logger.LogInformation(
            "Turn finished in session {SessionId}. Event '{EventTitle}', entries: {EntriesCount}, repeat turn: {RepeatTurn}, event roll phase: {IsEventRollPhase}",
            sessionId,
            resolution.Event.Title,
            resolution.Entries.Count,
            resolution.RepeatTurn,
            resolution.IsEventRollPhase);
    }

    public async Task SyncState(Guid sessionId)
    {
        logger.LogDebug("SyncState requested by connection {ConnectionId} for session {SessionId}", Context.ConnectionId, sessionId);

        if (!_sessionStore.TryGetSession(sessionId, out var session) || session is null)
        {
            throw new HubException("Session not found.");
        }

        GameStateDto state;
        lock (session)
        {
            state = SessionStorage.ToDto(session);
        }

        await Clients.Caller.SendAsync("StateUpdated", state);
    }

    private static bool ShouldStartEventRollPhase(GameSession session, GameCellEvent gameEvent, TurnResolutionPayload resolution)
    {
        return gameEvent.ResolutionMode == EventResolutionMode.Roll
               && !resolution.RepeatTurn
               && resolution.Entries.All(entry => entry.Outcome.Target == OutcomeTarget.AllPlayers)
               && session.Players.Any(player => !player.IsDead && player.PlayerId != session.ActiveTurnPlayerId);
    }

    private static void StartEventRollPhase(GameSession session, Guid ownerPlayerId, GameCellEvent gameEvent)
    {
        session.IsEventRollPhase = true;
        session.EventRollOwnerPlayerId = ownerPlayerId;
        session.PendingEventRollEvent = gameEvent;
        session.PendingEventRollPlayerIds.Clear();

        session.PendingEventRollPlayerIds.AddRange(session.Players
            .Where(player => !player.IsDead)
            .Select(player => player.PlayerId));
    }

    private static void CompleteEventRollPhase(GameSession session)
    {
        session.IsEventRollPhase = false;
        session.PendingEventRollEvent = null;
        session.PendingEventRollPlayerIds.Clear();
        session.EventRollOwnerPlayerId = Guid.Empty;
        AdvanceTurn(session);
    }

    private static int NormalizePosition(int position)
    {
        var normalized = position % BoardCellsCount;
        return normalized < 0 ? normalized + BoardCellsCount : normalized;
    }

    private static void AdvanceTurn(GameSession session)
    {
        var alive = session.Players.Where(p => !p.IsDead).ToList();
        if (alive.Count == 0)
        {
            session.ActiveTurnPlayerId = Guid.Empty;
            return;
        }

        var currentIndex = alive.FindIndex(p => p.PlayerId == session.ActiveTurnPlayerId);
        if (currentIndex < 0)
        {
            currentIndex = 0;
        }

        for (int i = 1; i <= alive.Count; i++)
        {
            var next = alive[(currentIndex + i) % alive.Count];
            if (next.TurnsToSkip > 0)
            {
                next.TurnsToSkip--;
                continue;
            }

            session.ActiveTurnPlayerId = next.PlayerId;
            return;
        }

        session.ActiveTurnPlayerId = alive[(currentIndex + 1) % alive.Count].PlayerId;
    }

    private PlayerState ValidateCallerAndGetCurrent(GameSession session)
    {
        if (session.Players.Count == 0)
        {
            throw new HubException("No players in session.");
        }

        var caller = session.Players.FirstOrDefault(player => player.ConnectionId == Context.ConnectionId)
                     ?? throw new HubException("Player is not part of this session.");

        if (session.IsEventRollPhase)
        {
            if (caller.IsDead)
            {
                throw new HubException("Dead players can't make turns.");
            }

            if (!session.PendingEventRollPlayerIds.Contains(caller.PlayerId))
            {
                throw new HubException("Waiting for other players to roll.");
            }

            return caller;
        }

        if (session.ActiveTurnPlayerId == Guid.Empty)
        {
            session.ActiveTurnPlayerId = session.Players.First(p => !p.IsDead).PlayerId;
        }

        if (caller.PlayerId != session.ActiveTurnPlayerId)
        {
            throw new HubException("Not your turn.");
        }

        if (caller.IsDead)
        {
            throw new HubException("Dead players can't make turns.");
        }

        return caller;
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
                var roll = Random.Shared.Next(1, 7);
                var outcome = gameEvent.RollOutcomes.FirstOrDefault(r => r.Range.InRange(roll))?.Outcome
                              ?? throw new HubException("No roll range matched outcome.");

                ApplyOutcome(target, outcome, ref repeatTurn);
                entries.Add(new ResolvedOutcomeEntry(target.PlayerId, roll, outcome));
            }
        }

        return new TurnResolutionPayload
        {
            Event = gameEvent,
            Entries = entries,
            RepeatTurn = repeatTurn,
            IsEventRollPhase = false,
            EventRollCompleted = false
        };
    }

    private static void ApplyOutcome(PlayerState player, EventOutcome outcome, ref bool repeatTurn)
    {
        if (player.IsDead)
        {
            return;
        }

        switch (outcome.Kind)
        {
            case OutcomeKind.None:
                return;
            case OutcomeKind.MoveByOffset:
                player.Position = NormalizePosition(player.Position + outcome.MoveOffset);
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
                return;
            default:
                throw new ArgumentOutOfRangeException();
        }
    }

    private static IEnumerable<PlayerState> ResolveTargets(GameSession session, PlayerState currentPlayer, OutcomeTarget target, Guid? chosenPlayerId)
    {
        return target switch
        {
            OutcomeTarget.CurrentPlayer => [currentPlayer],
            OutcomeTarget.ChosenPlayer => [
                session.Players.FirstOrDefault(p => p.PlayerId == chosenPlayerId && !p.IsDead)
                ?? session.Players.FirstOrDefault(p => p.PlayerId != currentPlayer.PlayerId && !p.IsDead)
                ?? currentPlayer],
            OutcomeTarget.AllPlayers => session.Players.Where(p => !p.IsDead),
            OutcomeTarget.Women => session.Players.Where(p => !p.IsMan && !p.IsDead),
            OutcomeTarget.Muslims => session.Players.Where(p => p.IsMuslim && !p.IsDead),
            OutcomeTarget.NonMuslims => session.Players.Where(p => !p.IsMuslim && !p.IsDead),
            _ => throw new ArgumentOutOfRangeException(nameof(target), target, null)
        };
    }

    private bool TryGetSessionId(out Guid sessionId)
    {
        if (Context.Items.TryGetValue(SessionIdContextKey, out var value) && value is Guid sid)
        {
            sessionId = sid;
            return true;
        }

        sessionId = Guid.Empty;
        return false;
    }

    private sealed record TurnResolutionPayload
    {
        public required GameCellEvent Event { get; init; }
        public required IReadOnlyList<ResolvedOutcomeEntry> Entries { get; init; }
        public required bool RepeatTurn { get; init; }
        public required bool IsEventRollPhase { get; init; }
        public required bool EventRollCompleted { get; init; }
    }

    private sealed class ResolvedOutcomeEntry
    {
        public ResolvedOutcomeEntry(Guid playerId, int roll, EventOutcome outcome)
        {
            PlayerId = playerId;
            Roll = roll;
            Outcome = outcome;
        }

        public Guid PlayerId { get; }
        public int Roll { get; }
        public EventOutcome Outcome { get; }
    }
}
