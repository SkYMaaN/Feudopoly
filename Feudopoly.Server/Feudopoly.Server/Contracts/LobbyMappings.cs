using Feudopoly.Server.Multiplayer;

namespace Feudopoly.Server.Contracts;

public static class LobbyMappings
{
    public static LobbyListItemDto ToListItem(GameSession session) => new()
    {
        LobbyId = session.SessionId,
        Name = session.Name,
        CurrentPlayers = session.Players.Count,
        MaxPlayers = session.MaxPlayers,
        Status = session.Status,
        AccessType = session.AccessType
    };

    public static LobbyDetailsDto ToDetails(GameSession session) => new()
    {
        LobbyId = session.SessionId,
        Name = session.Name,
        AccessType = session.AccessType,
        Status = session.Status,
        CurrentPlayers = session.Players.Count,
        MaxPlayers = session.MaxPlayers,
        OwnerPlayerId = session.OwnerPlayerId,
        Players = session.Players.Select(p => new LobbyPlayerDto
        {
            PlayerId = p.PlayerId,
            DisplayName = p.DisplayName,
            IsOwner = p.PlayerId == session.OwnerPlayerId,
            IsConnected = p.IsConnected
        }).ToArray()
    };
}
