using System.ComponentModel.DataAnnotations;

namespace Feudopoly.Server.Lobbies;

public sealed class CreateLobbyRequest
{
    [Required]
    [StringLength(80, MinimumLength = 3)]
    public string Name { get; set; } = string.Empty;

    [Required]
    public LobbyAccessType AccessType { get; set; }

    [StringLength(60, MinimumLength = 3)]
    public string? Password { get; set; }

    [Range(2, 4)]
    public int MaxPlayers { get; set; }

    [Required]
    public Guid UserId { get; set; }

    [Required]
    [StringLength(40, MinimumLength = 2)]
    public string DisplayName { get; set; } = string.Empty;
}

public sealed class JoinLobbyRequest
{
    [Required]
    public Guid UserId { get; set; }

    [Required]
    [StringLength(40, MinimumLength = 2)]
    public string DisplayName { get; set; } = string.Empty;

    public string? Password { get; set; }
}

public sealed class LeaveLobbyRequest
{
    [Required]
    public Guid UserId { get; set; }
}

public sealed class LobbyPlayerDto
{
    public required Guid UserId { get; init; }
    public required string DisplayName { get; init; }
    public required bool IsOwner { get; init; }
}

public sealed class LobbySummaryDto
{
    public required Guid LobbyId { get; init; }
    public required Guid SessionId { get; init; }
    public required string Name { get; init; }
    public required LobbyAccessType AccessType { get; init; }
    public required LobbyStatus Status { get; init; }
    public required int CurrentPlayers { get; init; }
    public required int MaxPlayers { get; init; }
}

public sealed class LobbyDetailsDto
{
    public required Guid LobbyId { get; init; }
    public required Guid SessionId { get; init; }
    public required Guid OwnerUserId { get; init; }
    public required string Name { get; init; }
    public required LobbyAccessType AccessType { get; init; }
    public required LobbyStatus Status { get; init; }
    public required int MaxPlayers { get; init; }
    public required IReadOnlyCollection<LobbyPlayerDto> Players { get; init; }
}
