using Feudopoly.Server.Multiplayer;
using Microsoft.Extensions.Logging.Abstractions;

namespace Feudopoly.Server.Tests;

public sealed class TurnTimeoutServiceTests
{
    private static TurnTimeoutService CreateService(TestGame game) =>
        // Notifications are only collected, never sent, so the notifier's hub contexts are not needed.
        new(game.Storage, game.Engine, new GameNotifier(null!, null!), NullLogger<TurnTimeoutService>.Instance);

    private static DateTime AfterDeadline(TestGame game) => game.Session.ActionDeadlineUtc!.Value.AddSeconds(1);

    [Fact]
    public void Nothing_happens_before_the_deadline()
    {
        var game = TestGame.With("Anna", "Boris");

        var actions = CreateService(game).CollectActions(game.Session, DateTime.UtcNow);

        Assert.Empty(actions);
        Assert.Equal(0, game["Anna"].Position);
    }

    [Fact]
    public void Stalled_roll_is_made_by_the_server()
    {
        var game = TestGame.With("Anna", "Boris");
        game.Dice.Enqueue(3);

        var actions = CreateService(game).CollectActions(game.Session, AfterDeadline(game));

        Assert.Single(actions);
        Assert.Equal(3, game["Anna"].Position);
        Assert.True(game.Session.IsTurnInProgress);
        Assert.True(game.Session.ActionDeadlineUtc > DateTime.UtcNow);
    }

    [Fact]
    public void Stalled_turn_resolution_is_finished_with_an_auto_picked_target()
    {
        var game = TestGame.With("Anna", "Boris", "Clara");
        game["Boris"].Position = 10;
        game["Clara"].Position = 10;
        game.StandOn("Anna", 12);
        GameEngine.RefreshActionDeadline(game.Session);

        CreateService(game).CollectActions(game.Session, AfterDeadline(game));

        Assert.False(game.Session.IsTurnInProgress);
        Assert.Contains(game.Session.Players, p => p.Position == 5);
        Assert.Equal("Boris", game.Active.DisplayName);
    }

    [Fact]
    public void Stalled_event_rollers_are_rolled_for()
    {
        var game = TestGame.With("Anna", "Boris", "Clara");
        game.StandOn("Anna", 1);
        game.Engine.FinishTurn(game.Session, game["Anna"], null);
        game.Dice.Enqueue(3);
        game.Engine.Roll(game.Session, game["Anna"]);
        game.Dice.Enqueue(2, 4);

        var actions = CreateService(game).CollectActions(game.Session, AfterDeadline(game));

        Assert.Equal(2, actions.Count);
        Assert.False(game.Session.IsEventRollPhase);
        Assert.Equal("Boris", game.Active.DisplayName);
    }

    [Fact]
    public void Players_who_never_opened_the_board_are_removed_after_the_join_timeout()
    {
        var game = TestGame.With("Anna", "Boris");
        game["Boris"].ConnectionId = string.Empty;
        game.Session.ActiveTurnPlayerId = game["Boris"].PlayerId;

        var service = CreateService(game);
        Assert.Empty(service.CollectActions(game.Session, game.Session.LaunchedAtUtc!.Value.AddSeconds(5)));

        // By the join timeout the first turn's deadline has passed too, so Anna gets auto-rolled right after.
        game.Dice.Enqueue(2);
        service.CollectActions(game.Session, game.Session.LaunchedAtUtc!.Value + GameEngine.JoinTimeout);

        var remaining = Assert.Single(game.Session.Players);
        Assert.Equal("Anna", remaining.DisplayName);
        Assert.Equal("Anna", game.Active.DisplayName);
        Assert.Equal(2, remaining.Position);
    }
}
