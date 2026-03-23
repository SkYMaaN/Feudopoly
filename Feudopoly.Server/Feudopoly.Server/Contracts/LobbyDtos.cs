using System.ComponentModel.DataAnnotations;
using Feudopoly.Server.Multiplayer;

namespace Feudopoly.Server.Contracts;

public sealed class CreateLobbyRequest
{
    [Required, MinLength(3), MaxLength(64)]
    public string Name { get; set; } = string.Empty;
    public LobbyAccessType AccessType { get; set; }
    [MaxLength(64)]
    public string? Password { get; set; }
    [Range(1, 4)]
    public int MaxPlayers { get; set; }
    public Guid CreatorId { get; set; }
    [Required, MinLength(2), MaxLength(28)]
    public string CreatorName { get; set; } = string.Empty;
    public bool IsMan { get; set; }
    public bool IsMuslim { get; set; }
}

public sealed class JoinLobbyRequest
{
    public Guid PlayerId { get; set; }
    [Required, MinLength(2), MaxLength(28)]
    public string DisplayName { get; set; } = string.Empty;
    public bool IsMan { get; set; }
    public bool IsMuslim { get; set; }
    public string? Password { get; set; }
}

public sealed class LeaveLobbyRequest
{
    public Guid PlayerId { get; set; }
}

public sealed class StartLobbyRequest
{
    public Guid PlayerId { get; set; }
}


public sealed class ApiErrorDto
{
    public required string Message { get; init; }
    public string? Code { get; init; }
}

public sealed class LobbyListItemDto
{
    public required Guid LobbyId { get; init; }
    public required string Name { get; init; }
    public required int CurrentPlayers { get; init; }
    public required int MaxPlayers { get; init; }
    public required LobbyStatus Status { get; init; }
    public required LobbyAccessType AccessType { get; init; }
}

public sealed class LobbyPlayerDto
{
    public required Guid PlayerId { get; init; }
    public required string DisplayName { get; init; }
    public required bool IsOwner { get; init; }
    public required bool IsConnected { get; init; }
}

public sealed class LobbyDetailsDto
{
    public required Guid LobbyId { get; init; }
    public required string Name { get; init; }
    public required LobbyAccessType AccessType { get; init; }
    public required LobbyStatus Status { get; init; }
    public required int CurrentPlayers { get; init; }
    public required int MaxPlayers { get; init; }
    public required Guid OwnerPlayerId { get; init; }
    public required IReadOnlyCollection<LobbyPlayerDto> Players { get; init; }
}
