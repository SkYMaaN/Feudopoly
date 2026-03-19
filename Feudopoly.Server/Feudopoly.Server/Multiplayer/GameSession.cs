namespace Feudopoly.Server.Multiplayer;

public sealed class GameSession
{
    public required Guid SessionId { get; init; }
    public required string Name { get; set; }
    public required LobbyAccessType AccessType { get; set; }
    public string? Password { get; set; }
    public required int MaxPlayers { get; set; }
    public required LobbyStatus Status { get; set; }
    public required Guid OwnerPlayerId { get; set; }
    public required List<PlayerState> Players { get; init; }
    public required Guid ActiveTurnPlayerId { get; set; }
    public required int LastRollValue { get; set; }
    public required DateTime CreatedAtUtc { get; init; }
    public required bool IsTurnInProgress { get; set; }
    public required bool IsEventRollPhase { get; set; }
    public required Guid EventRollOwnerPlayerId { get; set; }
    public required List<Guid> PendingEventRollPlayerIds { get; init; }
    public GameCellEvent? PendingEventRollEvent { get; set; }
    public required bool IsAwaitingAdditionalEventRoll { get; set; }
    public required Guid PendingAdditionalEventRollPlayerId { get; set; }
    public Guid? PendingAdditionalEventRollChosenPlayerId { get; set; }
    public GameCellEvent? PendingAdditionalEventRollEvent { get; set; }
}
