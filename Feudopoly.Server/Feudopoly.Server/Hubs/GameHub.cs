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
            await base.OnDisconnectedAsync(exception);
            return;
        }

        if (!_sessionStore.TryGetSession(sessionId, out var session) || session is null)
        {
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
                session.PendingRollPlayerIds.Remove(removedPlayer.PlayerId);

                if (session.Players.Count == 0)
                {
                    session.ActiveTurnPlayerId = Guid.Empty;
                    session.IsTurnInProgress = false;
                }
                else if (wasActive)
                {
                    AdvanceTurn(session);
                }
                else if (session.IsTurnInProgress && session.PendingEvent?.ResolutionMode == EventResolutionMode.Roll && session.PendingRollPlayerIds.Count == 0)
                {
                    session.PendingEvent = null;
                    session.PendingResolutionEntries.Clear();
                    session.IsTurnInProgress = false;
                    if (!session.PendingRepeatTurn)
                    {
                        AdvanceTurn(session);
                    }
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
    }

    public async Task RollDice(Guid sessionId)
    {
        if (!_sessionStore.TryGetSession(sessionId, out var session) || session is null)
        {
            throw new HubException("Session not found.");
        }

        PlayerState caller;
        int rolled;
        int newPosition;
        bool startsTurnEvent;
        TurnResolutionPayload? turnEndedPayload = null;
        GameStateDto state;

        lock (session)
        {
            caller = GetCaller(session);

            if (session.IsTurnInProgress && session.PendingEvent?.ResolutionMode == EventResolutionMode.Roll)
            {
                if (!session.PendingRollPlayerIds.Contains(caller.PlayerId))
                {
                    throw new HubException("You already rolled for this event.");
                }

                rolled = Random.Shared.Next(1, 7);
                var outcome = session.PendingEvent.RollOutcomes.FirstOrDefault(r => r.Range.InRange(rolled))?.Outcome
                              ?? throw new HubException("No roll range matched outcome.");

                session.LastRollValue = rolled;
                ApplyOutcome(caller, outcome, ref session.PendingRepeatTurn);
                session.PendingResolutionEntries.Add(new ResolvedOutcomeState { PlayerId = caller.PlayerId, Roll = rolled, Outcome = outcome });
                session.PendingRollPlayerIds.Remove(caller.PlayerId);

                startsTurnEvent = false;
                newPosition = caller.Position;

                if (session.PendingRollPlayerIds.Count == 0)
                {
                    turnEndedPayload = new TurnResolutionPayload
                    {
                        Event = session.PendingEvent,
                        Entries = session.PendingResolutionEntries
                            .Select(e => new ResolvedOutcomeEntry(e.PlayerId, e.Roll, e.Outcome))
                            .ToArray(),
                        RepeatTurn = session.PendingRepeatTurn
                    };

                    session.PendingEvent = null;
                    session.PendingResolutionEntries.Clear();
                    session.IsTurnInProgress = false;

                    if (!turnEndedPayload.RepeatTurn)
                    {
                        AdvanceTurn(session);
                    }
                }

                state = SessionStorage.ToDto(session);
            }
            else
            {
                var currentPlayer = ValidateCallerAndGetCurrent(session);

                if (session.IsTurnInProgress)
                {
                    throw new HubException("Turn is not finished yet.");
                }

                if (currentPlayer.TurnsToSkip > 0)
                {
                    throw new HubException($"You must skip {currentPlayer.TurnsToSkip} more turn(s).");
                }

                rolled = Random.Shared.Next(1, 7);
                session.LastRollValue = rolled;
                currentPlayer.Position = NormalizePosition(currentPlayer.Position + rolled);
                session.IsTurnInProgress = true;
                startsTurnEvent = true;
                newPosition = currentPlayer.Position;
                state = SessionStorage.ToDto(session);
            }
        }

        string groupName = sessionId.ToString();
        await Clients.Group(groupName).SendAsync("DiceRolled", new { playerId = caller.PlayerId, rollValue = rolled, newPosition, startsTurnEvent });
        await Clients.Group(groupName).SendAsync("StateUpdated", state);

        if (turnEndedPayload is not null)
        {
            await Clients.Group(groupName).SendAsync("TurnEnded", turnEndedPayload);
        }
    }

    public async Task BeginTurn(Guid sessionId)
    {
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

            if (session.PendingEvent is not null)
            {
                throw new HubException("Event already started for this turn.");
            }

            if (!_eventStorage.Events.TryGetValue(caller.Position, out cellEvent!))
            {
                throw new HubException($"Event for {caller.Position} position does not exist!");
            }

            session.PendingEvent = cellEvent;
            session.PendingResolutionEntries.Clear();
            session.PendingRepeatTurn = false;
            session.PendingRollPlayerIds.Clear();

            state = SessionStorage.ToDto(session);
        }

        string groupName = sessionId.ToString();
        await Clients.Group(groupName).SendAsync("StateUpdated", state);
        await Clients.Caller.SendAsync("TurnBegan", cellEvent);
    }

    public async Task FinishTurn(Guid sessionId, Guid? chosenPlayerId = null)
    {
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

            if (session.PendingEvent is null)
            {
                throw new HubException("Turn event was not started.");
            }

            cellEvent = session.PendingEvent;

            if (cellEvent.ResolutionMode == EventResolutionMode.Roll)
            {
                var targetScopes = cellEvent.RollOutcomes.Select(r => r.Outcome.Target).Distinct().ToList();
                var allTargets = targetScopes
                    .SelectMany(scope => ResolveTargets(session, caller, scope, chosenPlayerId))
                    .Where(p => p.IsConnected && !p.IsDead)
                    .DistinctBy(p => p.PlayerId)
                    .ToList();

                session.PendingRollPlayerIds.Clear();
                session.PendingRollPlayerIds.AddRange(allTargets.Select(p => p.PlayerId));
                session.PendingResolutionEntries.Clear();
                session.PendingRepeatTurn = false;

                if (session.PendingRollPlayerIds.Count == 0)
                {
                    session.PendingEvent = null;
                    session.IsTurnInProgress = false;
                    AdvanceTurn(session);
                }

                state = SessionStorage.ToDto(session);
                resolution = new TurnResolutionPayload
                {
                    Event = cellEvent,
                    Entries = [],
                    RepeatTurn = false
                };
            }
            else
            {
                resolution = ResolveEvent(session, caller, cellEvent, chosenPlayerId);

                session.PendingEvent = null;
                session.PendingRollPlayerIds.Clear();
                session.PendingResolutionEntries.Clear();
                session.IsTurnInProgress = false;
                if (!resolution.RepeatTurn)
                {
                    AdvanceTurn(session);
                }

                state = SessionStorage.ToDto(session);
            }
        }

        string groupName = sessionId.ToString();
        await Clients.Group(groupName).SendAsync("StateUpdated", state);
        if (resolution.Entries.Count > 0 || resolution.Event.ResolutionMode == EventResolutionMode.Fixed)
        {
            await Clients.Group(groupName).SendAsync("TurnEnded", resolution);
        }
    }

    public async Task SyncState(Guid sessionId)
    {
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

    private PlayerState GetCaller(GameSession session)
    {
        return session.Players.FirstOrDefault(player => player.ConnectionId == Context.ConnectionId)
               ?? throw new HubException("Player is not part of this session.");
    }

    private PlayerState ValidateCallerAndGetCurrent(GameSession session)
    {
        if (session.Players.Count == 0)
        {
            throw new HubException("No players in session.");
        }

        var caller = GetCaller(session);

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
            RepeatTurn = repeatTurn
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

    private sealed class TurnResolutionPayload
    {
        public required GameCellEvent Event { get; init; }
        public required IReadOnlyList<ResolvedOutcomeEntry> Entries { get; init; }
        public required bool RepeatTurn { get; init; }
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
