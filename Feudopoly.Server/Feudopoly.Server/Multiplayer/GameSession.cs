using System.Collections.Concurrent;

namespace Feudopoly.Server.Multiplayer;

public sealed class GameSession
{
    public required Guid SessionId { get; init; }
    public required List<PlayerState> Players { get; init; }
    public required Guid ActiveTurnPlayerId { get; set; }
    public required int LastRollValue { get; set; }
    public required DateTime CreatedAtUtc { get; init; }
}

public sealed class PlayerState
{
    public required string ConnectionId { get; init; }
    public required Guid PlayerId { get; init; }
    public required string DisplayName { get; set; }
    public required int Position { get; set; }
    public required bool IsConnected { get; set; }
}

public sealed class GameStateDto
{
    public required Guid SessionId { get; init; }
    public required IReadOnlyList<PlayerDto> Players { get; init; }
    public required Guid? ActiveTurnPlayerId { get; init; }
    public required int LastRollValue { get; init; }
}

public sealed class PlayerDto
{
    public required Guid PlayerId { get; init; }
    public required string DisplayName { get; init; }
    public required int Position { get; init; }
    public required bool IsConnected { get; init; }
}

public sealed class SessionStore
{
    private readonly ConcurrentDictionary<Guid, GameSession> sessions = new();

    public GameSession GetOrCreateSession(Guid sessionId)
    {
        return sessions.GetOrAdd(sessionId, key => new GameSession
        {
            SessionId = key,
            Players = [],
            ActiveTurnPlayerId = Guid.Empty,
            LastRollValue = 0,
            CreatedAtUtc = DateTime.UtcNow
        });
    }

    public bool TryGetSession(Guid sessionId, out GameSession? session)
    {
        return sessions.TryGetValue(sessionId, out session);
    }

    public void RemoveSessionIfEmpty(Guid sessionId)
    {
        if (!sessions.TryGetValue(sessionId, out var session))
        {
            return;
        }

        lock (session)
        {
            if (session.Players.Count == 0)
            {
                sessions.TryRemove(sessionId, out _);
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
            Players = session.Players.Select(player => new PlayerDto
            {
                PlayerId = player.PlayerId,
                DisplayName = player.DisplayName,
                Position = player.Position,
                IsConnected = player.IsConnected
            }).ToArray()
        };
    }
}
