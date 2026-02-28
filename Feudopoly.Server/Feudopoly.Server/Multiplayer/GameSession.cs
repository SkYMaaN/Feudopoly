namespace Feudopoly.Server.Multiplayer;

public sealed class GameSession
{
    public required Guid SessionId { get; init; }
    public required List<PlayerState> Players { get; init; }
    public required Guid ActiveTurnPlayerId { get; set; }
    public required int LastRollValue { get; set; }
    public required DateTime CreatedAtUtc { get; init; }
    public required bool IsTurnInProgress { get; set; }
    public Guid? CurrentTurnEventId { get; set; }
    public required Dictionary<Guid, int> CurrentTurnRolls { get; init; }
    public required HashSet<Guid> CurrentTurnRollTargets { get; init; }
}
