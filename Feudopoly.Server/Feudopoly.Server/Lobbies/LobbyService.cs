using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;

namespace Feudopoly.Server.Lobbies;

public sealed class LobbyService
{
    private const int MinPlayers = 2;
    private readonly ConcurrentDictionary<Guid, Lobby> _lobbies = new();
    private readonly ConcurrentDictionary<Guid, Guid> _userLobbyMap = new();

    public LobbyDetailsDto Create(CreateLobbyRequest request)
    {
        ValidateCreateRequest(request);

        if (_userLobbyMap.ContainsKey(request.UserId))
        {
            throw new InvalidOperationException("User is already in another lobby.");
        }

        var now = DateTime.UtcNow;
        var lobby = new Lobby
        {
            LobbyId = Guid.NewGuid(),
            SessionId = Guid.NewGuid(),
            OwnerUserId = request.UserId,
            Name = request.Name.Trim(),
            AccessType = request.AccessType,
            PasswordHash = request.AccessType == LobbyAccessType.Closed ? HashPassword(request.Password!) : null,
            MaxPlayers = request.MaxPlayers,
            CreatedAtUtc = now,
            Status = LobbyStatus.WaitingForPlayers,
            Players =
            [
                new LobbyPlayer
                {
                    UserId = request.UserId,
                    DisplayName = request.DisplayName.Trim(),
                    JoinedAtUtc = now,
                    IsOwner = true
                }
            ]
        };

        _lobbies[lobby.LobbyId] = lobby;
        _userLobbyMap[request.UserId] = lobby.LobbyId;
        RecalculateLobbyStatus(lobby);

        return ToDetailsDto(lobby);
    }

    public IReadOnlyCollection<LobbySummaryDto> List(string? search)
    {
        var normalized = search?.Trim();

        return _lobbies.Values
            .Where(lobby => string.IsNullOrWhiteSpace(normalized) || lobby.Name.Contains(normalized, StringComparison.OrdinalIgnoreCase))
            .OrderByDescending(lobby => lobby.CreatedAtUtc)
            .Select(ToSummaryDto)
            .ToArray();
    }

    public LobbyDetailsDto Get(Guid lobbyId)
    {
        var lobby = GetLobbyOrThrow(lobbyId);
        lock (lobby)
        {
            return ToDetailsDto(lobby);
        }
    }

    public LobbyDetailsDto Join(Guid lobbyId, JoinLobbyRequest request)
    {
        var lobby = GetLobbyOrThrow(lobbyId);

        if (_userLobbyMap.TryGetValue(request.UserId, out var existingLobbyId) && existingLobbyId != lobbyId)
        {
            throw new InvalidOperationException("User is already in another lobby.");
        }

        lock (lobby)
        {
            ValidateJoinRules(lobby, request);

            var existing = lobby.Players.FirstOrDefault(player => player.UserId == request.UserId);
            if (existing is not null)
            {
                existing.DisplayName = request.DisplayName.Trim();
                return ToDetailsDto(lobby);
            }

            lobby.Players.Add(new LobbyPlayer
            {
                UserId = request.UserId,
                DisplayName = request.DisplayName.Trim(),
                JoinedAtUtc = DateTime.UtcNow,
                IsOwner = false
            });

            _userLobbyMap[request.UserId] = lobbyId;
            RecalculateLobbyStatus(lobby);
            return ToDetailsDto(lobby);
        }
    }

    public void Leave(Guid lobbyId, Guid userId)
    {
        var lobby = GetLobbyOrThrow(lobbyId);

        lock (lobby)
        {
            if (lobby.Status is LobbyStatus.Launching or LobbyStatus.InGame or LobbyStatus.Finished)
            {
                throw new InvalidOperationException("Cannot leave lobby after game lifecycle has started.");
            }

            var player = lobby.Players.FirstOrDefault(item => item.UserId == userId)
                ?? throw new InvalidOperationException("Player is not in this lobby.");

            lobby.Players.Remove(player);
            _userLobbyMap.TryRemove(userId, out _);

            if (lobby.Players.Count == 0)
            {
                _lobbies.TryRemove(lobbyId, out _);
                return;
            }

            if (player.IsOwner)
            {
                var newOwner = lobby.Players.OrderBy(item => item.JoinedAtUtc).First();
                foreach (var item in lobby.Players)
                {
                    item.IsOwner = item.UserId == newOwner.UserId;
                }

                lobby.OwnerUserId = newOwner.UserId;
            }

            RecalculateLobbyStatus(lobby);
        }
    }

    public void SetStatus(Guid lobbyId, LobbyStatus status)
    {
        var lobby = GetLobbyOrThrow(lobbyId);
        lock (lobby)
        {
            lobby.Status = status;
        }
    }

    private static void ValidateCreateRequest(CreateLobbyRequest request)
    {
        if (request.MaxPlayers is < 2 or > 4)
        {
            throw new InvalidOperationException("Maximum players must be between 2 and 4.");
        }

        if (request.AccessType == LobbyAccessType.Closed && string.IsNullOrWhiteSpace(request.Password))
        {
            throw new InvalidOperationException("Password is required for closed lobbies.");
        }
    }

    private static void ValidateJoinRules(Lobby lobby, JoinLobbyRequest request)
    {
        if (lobby.Status is LobbyStatus.Launching or LobbyStatus.InGame or LobbyStatus.Finished)
        {
            throw new InvalidOperationException("Cannot join lobby in current status.");
        }

        if (lobby.Players.Count >= lobby.MaxPlayers)
        {
            throw new InvalidOperationException("Lobby is full.");
        }

        if (lobby.AccessType == LobbyAccessType.Closed)
        {
            if (string.IsNullOrWhiteSpace(request.Password) || HashPassword(request.Password) != lobby.PasswordHash)
            {
                throw new InvalidOperationException("Invalid lobby password.");
            }
        }
    }

    private Lobby GetLobbyOrThrow(Guid lobbyId)
    {
        if (!_lobbies.TryGetValue(lobbyId, out var lobby))
        {
            throw new KeyNotFoundException("Lobby not found.");
        }

        return lobby;
    }

    private static void RecalculateLobbyStatus(Lobby lobby)
    {
        lobby.Status = lobby.Players.Count >= MinPlayers
            ? LobbyStatus.Ready
            : LobbyStatus.WaitingForPlayers;
    }

    private static string HashPassword(string password)
    {
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(password.Trim()));
        return Convert.ToHexString(hash);
    }

    private static LobbySummaryDto ToSummaryDto(Lobby lobby) => new()
    {
        LobbyId = lobby.LobbyId,
        SessionId = lobby.SessionId,
        Name = lobby.Name,
        AccessType = lobby.AccessType,
        Status = lobby.Status,
        CurrentPlayers = lobby.Players.Count,
        MaxPlayers = lobby.MaxPlayers
    };

    private static LobbyDetailsDto ToDetailsDto(Lobby lobby) => new()
    {
        LobbyId = lobby.LobbyId,
        SessionId = lobby.SessionId,
        Name = lobby.Name,
        OwnerUserId = lobby.OwnerUserId,
        AccessType = lobby.AccessType,
        Status = lobby.Status,
        MaxPlayers = lobby.MaxPlayers,
        Players = lobby.Players
            .OrderBy(player => player.JoinedAtUtc)
            .Select(player => new LobbyPlayerDto
            {
                UserId = player.UserId,
                DisplayName = player.DisplayName,
                IsOwner = player.IsOwner
            }).ToArray()
    };
}
