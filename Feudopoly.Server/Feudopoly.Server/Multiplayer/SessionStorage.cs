using System.Collections.Concurrent;

namespace Feudopoly.Server.Multiplayer;

public sealed class SessionStorage
{
    private readonly ConcurrentDictionary<Guid, GameSession> _sessions = new();

    public GameSession GetOrCreateSession(Guid sessionId)
    {
        return _sessions.GetOrAdd(sessionId, key => new GameSession
        {
            SessionId = key,
            Players = [],
            ActiveTurnPlayerId = Guid.Empty,
            LastRollValue = 0,
            CreatedAtUtc = DateTime.UtcNow,
            IsTurnInProgress = false
        });
    }

    public bool TryGetSession(Guid sessionId, out GameSession? session)
    {
        return _sessions.TryGetValue(sessionId, out session);
    }

    public void RemoveSessionIfEmpty(Guid sessionId)
    {
        if (!_sessions.TryGetValue(sessionId, out var session))
        {
            return;
        }

        lock (session)
        {
            if (session.Players.Count == 0)
            {
                _sessions.TryRemove(sessionId, out _);
            }
        }
    }

    public static GameStateDto ToDto(GameSession session)
    {
        return new GameStateDto
        {
            SessionId = session.SessionId,
            ActiveTurnPlayerId = session.Players.Count > 0
                ? session.Players.FirstOrDefault(p => p.PlayerId == session.ActiveTurnPlayerId)?.PlayerId
                : null,
            LastRollValue = session.LastRollValue,
            IsTurnInProgress = session.IsTurnInProgress,
            PendingRollPlayerIds = session.PendingRollPlayerIds.ToArray(),
            Players = session.Players.Select(player => new PlayerDto
            {
                PlayerId = player.PlayerId,
                DisplayName = player.DisplayName,
                IsMan = player.IsMan,
                IsMuslim = player.IsMuslim,
                Position = player.Position,
                IsConnected = player.IsConnected,
                IsDead = player.IsDead
            }).ToArray()
        };
    }
}
