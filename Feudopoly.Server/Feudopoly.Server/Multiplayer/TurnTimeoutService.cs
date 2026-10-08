using Microsoft.AspNetCore.SignalR;

namespace Feudopoly.Server.Multiplayer;

/// <summary>
/// Server-side fallback for stalled turns. Client timers stop in background tabs and players who never open
/// the board can't act at all, so once <see cref="GameSession.ActionDeadlineUtc"/> passes the server acts for them.
/// </summary>
public sealed class TurnTimeoutService(
    SessionStorage sessionStorage,
    GameEngine engine,
    GameNotifier notifier,
    ILogger<TurnTimeoutService> logger) : BackgroundService
{
    private static readonly TimeSpan CheckInterval = TimeSpan.FromSeconds(2);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(CheckInterval);

        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken))
            {
                foreach (var session in sessionStorage.GetSessions())
                {
                    try
                    {
                        await ProcessSession(session, DateTime.UtcNow);
                    }
                    catch (Exception ex)
                    {
                        logger.LogError(ex, "Turn timeout processing failed for session {SessionId}", session.SessionId);
                    }
                }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            logger.LogDebug("Turn timeout service is stopping.");
        }
    }

    internal async Task ProcessSession(GameSession session, DateTime utcNow)
    {
        foreach (var notification in CollectActions(session, utcNow))
        {
            await notification();
        }
    }

    /// <summary>Applies all due actions under the session lock and returns the notifications to send afterwards.</summary>
    internal List<Func<Task>> CollectActions(GameSession session, DateTime utcNow)
    {
        var notifications = new List<Func<Task>>();
        var sessionId = session.SessionId;

        lock (session)
        {
            if (session.Status is not (LobbyStatus.Launching or LobbyStatus.InProgress))
            {
                return notifications;
            }

            // Players who never opened the board after launch would block their turns forever.
            if (session.LaunchedAtUtc is DateTime launchedAt && utcNow - launchedAt >= GameEngine.JoinTimeout)
            {
                foreach (var player in session.Players.Where(p => string.IsNullOrEmpty(p.ConnectionId)).ToList())
                {
                    var result = engine.RemovePlayer(session, player);
                    logger.LogInformation("Player {PlayerId} never joined session {SessionId} and was removed", player.PlayerId, sessionId);

                    if (result.SessionRemoved)
                    {
                        notifications.Add(() => notifier.LobbyDeletedAsync(sessionId));
                        return notifications;
                    }

                    var state = SessionStorage.ToDto(session);
                    notifications.Add(() => notifier.PlayerRemovedAsync(sessionId, player.PlayerId, result, state));
                }
            }

            if (session.Status != LobbyStatus.InProgress || session.ActionDeadlineUtc is not DateTime deadline || utcNow < deadline)
            {
                return notifications;
            }

            try
            {
                ActForStalledPlayers(session, notifications);
            }
            catch (HubException ex)
            {
                // Never retry a broken state in a tight loop; wait for the next deadline instead.
                logger.LogWarning(ex, "Turn timeout action failed in session {SessionId}", sessionId);
                GameEngine.RefreshActionDeadline(session);
            }

            SessionStorage.TouchSession(session);
        }

        return notifications;
    }

    private void ActForStalledPlayers(GameSession session, List<Func<Task>> notifications)
    {
        var sessionId = session.SessionId;

        if (session.IsEventRollPhase)
        {
            foreach (var playerId in session.PendingEventRollPlayerIds.ToList())
            {
                var player = session.Players.FirstOrDefault(p => p.PlayerId == playerId);
                if (player is null || !session.IsEventRollPhase)
                {
                    continue;
                }

                var result = engine.Roll(session, player);
                var state = SessionStorage.ToDto(session);
                var connectionId = player.ConnectionId;
                notifications.Add(() => notifier.RolledAsync(sessionId, connectionId, result, state));
                logger.LogInformation("Auto-rolled event dice for player {PlayerId} in session {SessionId}", playerId, sessionId);
            }

            return;
        }

        var activePlayer = session.Players.FirstOrDefault(p => p.PlayerId == session.ActiveTurnPlayerId);
        if (activePlayer is null)
        {
            GameEngine.RefreshActionDeadline(session);
            return;
        }

        var activeConnectionId = activePlayer.ConnectionId;
        if (session.IsTurnInProgress)
        {
            var result = engine.FinishTurn(session, activePlayer, chosenPlayerId: null, autoPickTarget: true);
            var state = SessionStorage.ToDto(session);
            notifications.Add(() => notifier.TurnFinishedAsync(sessionId, activeConnectionId, result, state));
            logger.LogInformation("Auto-finished turn for player {PlayerId} in session {SessionId}", activePlayer.PlayerId, sessionId);
        }
        else
        {
            var result = engine.Roll(session, activePlayer);
            var state = SessionStorage.ToDto(session);
            notifications.Add(() => notifier.RolledAsync(sessionId, activeConnectionId, result, state));
            logger.LogInformation("Auto-rolled for player {PlayerId} in session {SessionId}", activePlayer.PlayerId, sessionId);
        }
    }
}
