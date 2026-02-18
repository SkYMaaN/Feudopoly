using System.Collections.Concurrent;

namespace Feudopoly.Server.Multiplayer;

public sealed class GameSession
{
    public required string SessionId { get; init; }
    public required List<PlayerState> Players { get; init; }
    public required int ActiveTurnIndex { get; set; }
    public required int LastRollValue { get; set; }
    public required DateTime CreatedAtUtc { get; init; }
}

public sealed class PlayerState
{
    public required string ConnectionId { get; init; }
    public required string PlayerId { get; init; }
    public required string DisplayName { get; set; }
    public required int Position { get; set; }
    public required bool IsConnected { get; set; }
}

public sealed class GameStateDto
{
    public required string SessionId { get; init; }
    public required IReadOnlyList<PlayerDto> Players { get; init; }
    public required int ActiveTurnIndex { get; init; }
    public required int LastRollValue { get; init; }
}

public sealed class PlayerDto
{
    public required string PlayerId { get; init; }
    public required string DisplayName { get; init; }
    public required int Position { get; init; }
    public required bool IsConnected { get; init; }
}

public sealed class SessionStore
{
    private readonly ConcurrentDictionary<string, GameSession> sessions = new(StringComparer.OrdinalIgnoreCase);

    public GameSession GetOrCreateSession(string sessionId)
    {
        return sessions.GetOrAdd(sessionId, key => new GameSession
        {
            SessionId = key,
            Players = [],
            ActiveTurnIndex = 0,
            LastRollValue = 0,
            CreatedAtUtc = DateTime.UtcNow
        });
    }

    public bool TryGetSession(string sessionId, out GameSession? session)
    {
        return sessions.TryGetValue(sessionId, out session);
    }

    public void RemoveSessionIfEmpty(string sessionId)
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
            ActiveTurnIndex = session.ActiveTurnIndex,
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
