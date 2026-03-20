using System.Collections.Concurrent;

namespace Feudopoly.Server.Multiplayer;

public sealed class SessionStorage
{
    private const int MinPlayers = 1;
    private const int MaxPlayersLimit = 4;

    public static readonly TimeSpan LobbyInactivityTimeout = TimeSpan.FromMinutes(5);

    private readonly ConcurrentDictionary<Guid, GameSession> _sessions = new();
    private readonly ConcurrentDictionary<Guid, Guid> _playerToSession = new();

    public GameSession CreateSession(string name, LobbyAccessType accessType, string? password, int maxPlayers, PlayerState owner)
    {
        if (maxPlayers < MinPlayers || maxPlayers > MaxPlayersLimit)
        {
            throw new InvalidDataException("Max players must be in range [1..4].");
        }

        if (accessType == LobbyAccessType.Closed && string.IsNullOrWhiteSpace(password))
        {
            throw new InvalidDataException("Password is required for closed lobbies.");
        }

        if (_playerToSession.ContainsKey(owner.PlayerId))
        {
            throw new InvalidDataException("Player already belongs to a lobby.");
        }

        var session = new GameSession
        {
            SessionId = Guid.NewGuid(),
            Name = name.Trim(),
            AccessType = accessType,
            Password = string.IsNullOrWhiteSpace(password) ? null : password.Trim(),
            MaxPlayers = maxPlayers,
            Status = LobbyStatus.WaitingForPlayers,
            OwnerPlayerId = owner.PlayerId,
            Players = [owner],
            ActiveTurnPlayerId = owner.PlayerId,
            LastRollValue = 0,
            CreatedAtUtc = DateTime.UtcNow,
            LastActivityAtUtc = DateTime.UtcNow,
            IsTurnInProgress = false,
            IsEventRollPhase = false,
            EventRollOwnerPlayerId = Guid.Empty,
            PendingEventRollPlayerIds = [],
            PendingEventRollEvent = null
        };

        _sessions.TryAdd(session.SessionId, session);
        _playerToSession[owner.PlayerId] = session.SessionId;
        UpdateStatus(session);
        return session;
    }

    public bool TryGetSession(Guid sessionId, out GameSession? session) => _sessions.TryGetValue(sessionId, out session);

    public IReadOnlyCollection<GameSession> GetSessions() => _sessions.Values.OrderByDescending(x => x.CreatedAtUtc).ToArray();

    public bool DeleteLobby(GameSession session)
    {
        lock (session)
        {
            if (!_sessions.TryRemove(session.SessionId, out _))
            {
                return false;
            }

            foreach (var player in session.Players)
            {
                _playerToSession.TryRemove(player.PlayerId, out _);
            }

            return true;
        }
    }

    public void JoinLobby(GameSession session, Guid playerId, string displayName, bool isMan, bool isMuslim, string? password)
    {
        lock (session)
        {
            if (session.Status is LobbyStatus.Launching or LobbyStatus.InProgress or LobbyStatus.Completed)
            {
                throw new InvalidDataException("Cannot join this session in current status.");
            }

            if (session.Players.Count >= session.MaxPlayers)
            {
                throw new InvalidDataException("Session is full.");
            }

            if (_playerToSession.ContainsKey(playerId))
            {
                throw new InvalidDataException("Player already belongs to a lobby.");
            }

            if (session.AccessType == LobbyAccessType.Closed && !string.Equals(session.Password, password?.Trim(), StringComparison.Ordinal))
            {
                throw new InvalidDataException("Invalid lobby password.");
            }

            session.Players.Add(new PlayerState
            {
                PlayerId = playerId,
                DisplayName = displayName.Trim(),
                IsMan = isMan,
                IsMuslim = isMuslim,
                Position = 0,
                IsConnected = false,
                IsDead = false,
                IsSpectator = false,
                IsWinner = false,
                TurnsToSkip = 0
            });

            _playerToSession[playerId] = session.SessionId;
            EnsureActiveTurnPlayer(session);
            UpdateStatus(session);
            TouchSession(session);
        }
    }

    public bool LeaveLobby(GameSession session, Guid playerId)
    {
        lock (session)
        {
            var player = session.Players.FirstOrDefault(p => p.PlayerId == playerId)
                ?? throw new InvalidDataException("Player not in lobby.");

            if (session.Status is LobbyStatus.InProgress or LobbyStatus.Completed)
            {
                throw new InvalidDataException("Cannot leave after game start.");
            }

            session.Players.Remove(player);
            _playerToSession.TryRemove(playerId, out _);

            if (session.Players.Count == 0)
            {
                _sessions.TryRemove(session.SessionId, out _);
                return true;
            }

            if (session.OwnerPlayerId == playerId)
            {
                session.OwnerPlayerId = session.Players.First(p => !p.IsDead).PlayerId;
            }

            EnsureActiveTurnPlayer(session);
            UpdateStatus(session);
            TouchSession(session);

            if (session.Players.Count < MinPlayers)
            {
                session.Status = LobbyStatus.Completed;
                _sessions.TryRemove(session.SessionId, out _);
                foreach (var left in session.Players)
                {
                    _playerToSession.TryRemove(left.PlayerId, out _);
                }

                return true;
            }

            return false;
        }
    }

    public void StartLobby(GameSession session, Guid callerId)
    {
        lock (session)
        {
            if (session.OwnerPlayerId != callerId)
            {
                throw new InvalidDataException("Only owner can start.");
            }

            UpdateStatus(session);
            if (session.Status != LobbyStatus.Ready)
            {
                throw new InvalidDataException("Not enough players to start.");
            }

            EnsureActiveTurnPlayer(session);
            session.Status = LobbyStatus.Launching;
            TouchSession(session);
        }
    }

    public void MarkInProgress(GameSession session)
    {
        lock (session)
        {
            if (session.Status is LobbyStatus.Launching or LobbyStatus.Ready)
            {
                EnsureActiveTurnPlayer(session);
                session.Status = LobbyStatus.InProgress;
            }

            TouchSession(session);
        }
    }

    public bool TryGetSessionForPlayer(Guid playerId, out Guid sessionId) => _playerToSession.TryGetValue(playerId, out sessionId);

    public bool RemovePlayerFromSession(GameSession session, Guid playerId)
    {
        lock (session)
        {
            var player = session.Players.FirstOrDefault(p => p.PlayerId == playerId)
                ?? throw new InvalidDataException("Player not in session.");

            session.Players.Remove(player);
            _playerToSession.TryRemove(playerId, out _);
            session.PendingEventRollPlayerIds.Remove(playerId);

            if (session.Players.Count == 0)
            {
                _sessions.TryRemove(session.SessionId, out _);
                return true;
            }

            if (session.OwnerPlayerId == playerId)
            {
                session.OwnerPlayerId = session.Players[0].PlayerId;
            }

            if (session.ActiveTurnPlayerId == playerId)
            {
                session.ActiveTurnPlayerId = Guid.Empty;
            }

            EnsureActiveTurnPlayer(session);
            TouchSession(session);
            return false;
        }
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

    public LobbyDeletionReason? GetDeletionReason(GameSession session, DateTime utcNow)
    {
        lock (session)
        {
            if (session.Players.Count == 0)
            {
                return LobbyDeletionReason.EmptyLobby;
            }

            if (!session.Players.Any(IsLobbyParticipant))
            {
                return LobbyDeletionReason.NoActivePlayers;
            }

            if (utcNow - session.LastActivityAtUtc >= LobbyInactivityTimeout)
            {
                return LobbyDeletionReason.Inactive;
            }

            return null;
        }
    }

    public static void TouchSession(GameSession session)
    {
        session.LastActivityAtUtc = DateTime.UtcNow;
    }

    private static void EnsureActiveTurnPlayer(GameSession session)
    {
        if (session.Players.Count == 0)
        {
            session.ActiveTurnPlayerId = Guid.Empty;
            return;
        }

        var hasActiveTurnPlayer = session.Players.Any(player => player.PlayerId == session.ActiveTurnPlayerId);
        if (hasActiveTurnPlayer)
        {
            return;
        }

        session.ActiveTurnPlayerId = session.Players.First().PlayerId;
    }

    private static bool IsLobbyParticipant(PlayerState player) => !player.IsDead && !player.IsSpectator && !player.IsWinner;

    public static void UpdateStatus(GameSession session)
    {
        if (session.Status is LobbyStatus.Launching or LobbyStatus.InProgress or LobbyStatus.Completed)
        {
            return;
        }

        session.Status = session.Players.Count >= MinPlayers ? LobbyStatus.Ready : LobbyStatus.WaitingForPlayers;
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
            IsEventRollPhase = session.IsEventRollPhase,
            PendingEventRollPlayerIds = session.PendingEventRollPlayerIds.ToArray(),
            Players = session.Players.Select(player => new PlayerDto
            {
                PlayerId = player.PlayerId,
                DisplayName = player.DisplayName,
                IsMan = player.IsMan,
                IsMuslim = player.IsMuslim,
                Position = player.Position,
                TurnsToSkip = player.TurnsToSkip,
                IsConnected = player.IsConnected,
                IsDead = player.IsDead,
                IsSpectator = player.IsSpectator,
                IsWinner = player.IsWinner
            }).ToArray()
        };
    }
}
