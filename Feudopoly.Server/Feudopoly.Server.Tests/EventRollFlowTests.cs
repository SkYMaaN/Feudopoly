using Feudopoly.Server.Multiplayer;

namespace Feudopoly.Server.Tests;

public sealed class EventRollFlowTests
{
    private readonly EventStorage _eventStorage = new();

    [Fact]
    public void ResolveParticipants_CurrentPlayerRollEvent_ReturnsLandingPlayerOnly()
    {
        var currentPlayer = CreatePlayer("Current", isMan: true);
        var secondPlayer = CreatePlayer("Other", isMan: false);
        var session = CreateSession(currentPlayer, secondPlayer);
        var gameEvent = _eventStorage.Events[4];

        var participants = EventRollFlow.ResolveParticipants(session, currentPlayer, gameEvent, chosenPlayerId: null, ResolveTargets);

        Assert.True(EventRollFlow.ShouldStart(gameEvent, participants));
        Assert.Collection(participants, player => Assert.Equal(currentPlayer.PlayerId, player.PlayerId));
    }

    [Fact]
    public void ResolveParticipants_GroupRollEvent_ReturnsOnlyMatchingActivePlayers()
    {
        var currentPlayer = CreatePlayer("Current", isMan: true);
        var womanOne = CreatePlayer("Woman one", isMan: false);
        var womanTwo = CreatePlayer("Woman two", isMan: false, isDead: true);
        var malePlayer = CreatePlayer("Male", isMan: true);
        var session = CreateSession(currentPlayer, womanOne, womanTwo, malePlayer);
        var gameEvent = _eventStorage.Events[18];

        var participants = EventRollFlow.ResolveParticipants(session, currentPlayer, gameEvent, chosenPlayerId: null, ResolveTargets);

        Assert.True(EventRollFlow.ShouldStart(gameEvent, participants));
        Assert.Collection(participants, player => Assert.Equal(womanOne.PlayerId, player.PlayerId));
    }

    [Theory]
    [InlineData(1, OutcomeKind.Eliminate, "You die in battle.")]
    [InlineData(2, OutcomeKind.Eliminate, "You die without ever having fought.")]
    [InlineData(3, OutcomeKind.SkipTurns, "Skip 2 moves.")]
    [InlineData(6, OutcomeKind.SkipTurns, "Skip 2 moves.")]
    public void ResolveOutcome_PreservesExactDiceRanges_ForEvent25(int rolled, OutcomeKind expectedKind, string expectedText)
    {
        var gameEvent = _eventStorage.Events[25];

        var outcome = EventRollFlow.ResolveOutcome(gameEvent, rolled);

        Assert.Equal(expectedKind, outcome.Kind);
        Assert.Equal(expectedText, outcome.Text);
    }

    [Fact]
    public void ResolveOutcome_DoesNotLeakAdjacentEventRollRanges()
    {
        var daVinciEvent = _eventStorage.Events[20];
        var americaEvent = _eventStorage.Events[21];

        var daVinciOutcome = EventRollFlow.ResolveOutcome(daVinciEvent, 5);
        var americaOutcome = EventRollFlow.ResolveOutcome(americaEvent, 5);

        Assert.Equal(OutcomeKind.RepeatRoll, daVinciOutcome.Kind);
        Assert.Equal("You have difficulty forming your own opinion. Pass the cube on.", daVinciOutcome.Text);
        Assert.Equal(OutcomeKind.None, americaOutcome.Kind);
        Assert.Equal("You can't read, you know nothing about America -> smile and be glad. You are not capable of more than that.", americaOutcome.Text);
    }

    private static GameSession CreateSession(params PlayerState[] players) => new()
    {
        SessionId = Guid.NewGuid(),
        Name = "test",
        AccessType = LobbyAccessType.Open,
        MaxPlayers = 4,
        Status = LobbyStatus.InProgress,
        OwnerPlayerId = players[0].PlayerId,
        Players = [.. players],
        ActiveTurnPlayerId = players[0].PlayerId,
        LastRollValue = 0,
        CreatedAtUtc = DateTime.UtcNow,
        IsTurnInProgress = false,
        IsEventRollPhase = false,
        EventRollOwnerPlayerId = Guid.Empty,
        PendingEventRollPlayerIds = [],
        PendingEventRollEvent = null
    };

    private static PlayerState CreatePlayer(string name, bool isMan, bool isDead = false) => new()
    {
        PlayerId = Guid.NewGuid(),
        DisplayName = name,
        IsMan = isMan,
        IsMuslim = false,
        Position = 0,
        IsConnected = true,
        IsDead = isDead,
        IsSpectator = false,
        IsWinner = false,
        TurnsToSkip = 0
    };

    private static IEnumerable<PlayerState> ResolveTargets(GameSession session, PlayerState currentPlayer, OutcomeTarget target, Guid? chosenPlayerId)
        => target switch
        {
            OutcomeTarget.CurrentPlayer => [currentPlayer],
            OutcomeTarget.ChosenPlayer => [
                session.Players.FirstOrDefault(player => player.PlayerId == chosenPlayerId && IsActive(player))
                ?? session.Players.FirstOrDefault(player => player.PlayerId != currentPlayer.PlayerId && IsActive(player))
                ?? currentPlayer],
            OutcomeTarget.AllPlayers => session.Players.Where(IsActive),
            OutcomeTarget.Women => session.Players.Where(player => !player.IsMan && IsActive(player)),
            OutcomeTarget.Muslims => session.Players.Where(player => player.IsMuslim && IsActive(player)),
            OutcomeTarget.NonMuslims => session.Players.Where(player => !player.IsMuslim && IsActive(player)),
            _ => throw new ArgumentOutOfRangeException(nameof(target), target, null)
        };

    private static bool IsActive(PlayerState player) => !player.IsDead && !player.IsSpectator && !player.IsWinner;
}
