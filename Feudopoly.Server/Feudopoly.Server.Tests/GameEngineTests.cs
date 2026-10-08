using Feudopoly.Server.Multiplayer;
using Microsoft.AspNetCore.SignalR;

namespace Feudopoly.Server.Tests;

public sealed class GameEngineTests
{
    [Fact]
    public void Roll_moves_the_active_player_and_starts_the_turn()
    {
        var game = TestGame.With("Anna", "Boris");
        game.Dice.Enqueue(4);

        var result = game.Engine.Roll(game.Session, game["Anna"]);

        Assert.Equal(4, result.NewPosition);
        Assert.Equal(4, game["Anna"].Position);
        Assert.True(game.Session.IsTurnInProgress);
        Assert.Equal(game["Anna"].PlayerId, game.Session.ActiveTurnPlayerId);
    }

    [Fact]
    public void Roll_out_of_turn_is_rejected()
    {
        var game = TestGame.With("Anna", "Boris");
        game.Dice.Enqueue(4);

        Assert.Throws<HubException>(() => game.Engine.Roll(game.Session, game["Boris"]));
    }

    [Fact]
    public void Passing_the_last_cell_wins()
    {
        var game = TestGame.With("Anna", "Boris");
        game["Anna"].Position = 27;
        game.Dice.Enqueue(3);

        var result = game.Engine.Roll(game.Session, game["Anna"]);

        Assert.True(result.CompletedWinningLap);
        Assert.True(game["Anna"].IsWinner);
        Assert.False(game.Session.IsTurnInProgress);
        Assert.Equal(game["Boris"].PlayerId, game.Session.ActiveTurnPlayerId);
    }

    [Theory]
    [InlineData(15, 8)]
    [InlineData(19, 17)]
    [InlineData(28, 24)]
    public void Move_to_field_events_place_the_player_on_the_field(int eventCell, int expectedCell)
    {
        var game = TestGame.With("Anna", "Boris");
        game.StandOn("Anna", eventCell);

        game.Engine.FinishTurn(game.Session, game["Anna"], null);

        Assert.Equal(expectedCell, game["Anna"].Position);
        Assert.Equal(game["Boris"].PlayerId, game.Session.ActiveTurnPlayerId);
    }

    [Fact]
    public void Event_3_keeps_the_turn_with_the_current_player()
    {
        var game = TestGame.With("Anna", "Boris");
        game.StandOn("Anna", 3);

        var result = game.Engine.FinishTurn(game.Session, game["Anna"], null);

        Assert.True(result.Resolution.RepeatTurn);
        Assert.Equal(game["Anna"].PlayerId, game.Session.ActiveTurnPlayerId);
    }

    [Fact]
    public void Skip_turn_penalty_skips_exactly_that_many_rounds()
    {
        var game = TestGame.With("Anna", "Boris");
        game.StandOn("Anna", 2); // Franciscan Order: skip 2 rounds.

        game.Engine.FinishTurn(game.Session, game["Anna"], null);
        Assert.Equal(2, game["Anna"].TurnsToSkip);
        Assert.Equal("Boris", game.Active.DisplayName);

        // Boris plays two plain turns (cell 17: nothing happens) while Anna sits out.
        for (var round = 0; round < 2; round++)
        {
            game.StandOn("Boris", 17);
            game.Engine.FinishTurn(game.Session, game["Boris"], null);
            Assert.Equal("Boris", game.Active.DisplayName);
        }

        game.StandOn("Boris", 17);
        game.Engine.FinishTurn(game.Session, game["Boris"], null);
        Assert.Equal("Anna", game.Active.DisplayName);
        Assert.Equal(0, game["Anna"].TurnsToSkip);
    }

    [Fact]
    public void Crusades_make_every_active_player_roll_for_themselves()
    {
        var game = TestGame.With("Anna", "Boris", "Clara");
        game["Clara"].IsDead = true;
        game.StandOn("Anna", 1);

        var finish = game.Engine.FinishTurn(game.Session, game["Anna"], null);

        Assert.True(finish.Resolution.IsEventRollPhase);
        Assert.True(game.Session.IsEventRollPhase);
        Assert.Equal([game["Anna"].PlayerId, game["Boris"].PlayerId], game.Session.PendingEventRollPlayerIds);

        game.Dice.Enqueue(1, 5);
        game.Engine.Roll(game.Session, game["Boris"]);
        Assert.True(game["Boris"].IsDead);
        Assert.True(game.Session.IsEventRollPhase);

        var last = game.Engine.Roll(game.Session, game["Anna"]);
        Assert.Equal(4, game["Anna"].Position);
        Assert.True(last.PhaseResolution!.EventRollCompleted);
        Assert.False(game.Session.IsEventRollPhase);
    }

    [Fact]
    public void Malleus_Maleficarum_only_makes_women_roll()
    {
        var game = TestGame.With(("Anna", true, false), ("Boris", false, false), ("Clara", true, true));
        game.StandOn("Boris", 18);

        game.Engine.FinishTurn(game.Session, game["Boris"], null);

        Assert.Equal([game["Anna"].PlayerId, game["Clara"].PlayerId], game.Session.PendingEventRollPlayerIds);
        Assert.Throws<HubException>(() => game.Engine.Roll(game.Session, game["Boris"]));

        game.Dice.Enqueue(6, 1);
        game.Engine.Roll(game.Session, game["Anna"]);
        game.Engine.Roll(game.Session, game["Clara"]);

        Assert.True(game["Anna"].IsDead);
        Assert.False(game["Clara"].IsDead);
        Assert.False(game["Boris"].IsDead);
        Assert.Equal("Clara", game.Active.DisplayName);
    }

    [Fact]
    public void Ottomans_move_muslims_forward_and_others_back()
    {
        var game = TestGame.With(("Anna", false, true), ("Boris", false, false), ("Clara", false, false));
        game["Boris"].Position = 10;
        game["Clara"].Position = 0;
        game.StandOn("Anna", 23);

        game.Engine.FinishTurn(game.Session, game["Anna"], null);

        Assert.Equal(24, game["Anna"].Position);
        Assert.Equal(9, game["Boris"].Position);
        // Regression: moving back from the start used to wrap to field 29, one roll from winning.
        Assert.Equal(0, game["Clara"].Position);
    }

    [Theory]
    [InlineData(10, 5)]
    [InlineData(5, 0)]
    [InlineData(3, 0)]
    [InlineData(0, 0)]
    public void Spy_moves_the_chosen_player_back_5_but_not_past_the_start(int targetPosition, int expectedPosition)
    {
        var game = TestGame.With("Anna", "Boris", "Clara");
        game["Clara"].Position = targetPosition;
        game.StandOn("Anna", 12);

        game.Engine.FinishTurn(game.Session, game["Anna"], game["Clara"].PlayerId);

        Assert.Equal(expectedPosition, game["Clara"].Position);
        Assert.Equal(12, game["Anna"].Position);
    }

    [Fact]
    public void Spy_requires_a_choice_when_several_targets_exist()
    {
        var game = TestGame.With("Anna", "Boris", "Clara");
        game.StandOn("Anna", 12);

        Assert.Throws<HubException>(() => game.Engine.FinishTurn(game.Session, game["Anna"], null));
        Assert.True(game.Session.IsTurnInProgress);
    }

    [Fact]
    public void Spy_auto_pick_chooses_a_valid_target()
    {
        var game = TestGame.With("Anna", "Boris", "Clara");
        game["Boris"].Position = 10;
        game["Clara"].Position = 10;
        game.StandOn("Anna", 12);

        var result = game.Engine.FinishTurn(game.Session, game["Anna"], null, autoPickTarget: true);

        var entry = Assert.Single(result.Resolution.Entries);
        Assert.NotEqual(game["Anna"].PlayerId, entry.PlayerId);
        Assert.Equal(5, game.Session.Players.Single(p => p.PlayerId == entry.PlayerId).Position);
    }

    [Fact]
    public void Thirty_years_war_roll_of_1_eliminates_the_player()
    {
        var game = TestGame.With("Anna", "Boris");
        game.StandOn("Anna", 24);
        game.Engine.FinishTurn(game.Session, game["Anna"], null);

        game.Dice.Enqueue(1);
        game.Engine.Roll(game.Session, game["Anna"]);

        Assert.True(game["Anna"].IsDead);
        Assert.Equal("Boris", game.Active.DisplayName);
    }

    [Fact]
    public void Game_completes_when_the_last_active_player_dies()
    {
        var game = TestGame.With("Anna");
        game.StandOn("Anna", 16);
        game.Engine.FinishTurn(game.Session, game["Anna"], null);

        game.Dice.Enqueue(6);
        var result = game.Engine.Roll(game.Session, game["Anna"]);

        Assert.True(result.GameCompleted);
        Assert.Equal(LobbyStatus.Completed, game.Session.Status);
    }

    [Fact]
    public void Active_player_leaving_mid_turn_lets_the_next_player_roll()
    {
        var game = TestGame.With("Anna", "Boris", "Clara");
        game.Dice.Enqueue(4);
        game.Engine.Roll(game.Session, game["Anna"]);
        Assert.True(game.Session.IsTurnInProgress);

        var result = game.Engine.RemovePlayer(game.Session, game["Anna"]);

        Assert.False(result.SessionRemoved);
        Assert.False(game.Session.IsTurnInProgress);
        Assert.Equal("Boris", game.Active.DisplayName);

        game.Dice.Enqueue(2);
        game.Engine.Roll(game.Session, game["Boris"]);
        Assert.Equal(2, game["Boris"].Position);
    }

    [Fact]
    public void Last_pending_event_roller_leaving_ends_the_event_phase()
    {
        var game = TestGame.With("Anna", "Boris", "Clara");
        game.StandOn("Anna", 1);
        game.Engine.FinishTurn(game.Session, game["Anna"], null);
        game.Dice.Enqueue(3, 3);
        game.Engine.Roll(game.Session, game["Anna"]);
        game.Engine.Roll(game.Session, game["Boris"]);

        game.Engine.RemovePlayer(game.Session, game["Clara"]);

        Assert.False(game.Session.IsEventRollPhase);
        Assert.Equal("Boris", game.Active.DisplayName);
    }

    [Fact]
    public void Game_completes_when_the_last_active_player_leaves()
    {
        var game = TestGame.With("Anna", "Boris", "Clara");
        game["Anna"].IsWinner = true;
        game["Boris"].IsDead = true;
        game.Session.ActiveTurnPlayerId = game["Clara"].PlayerId;

        var result = game.Engine.RemovePlayer(game.Session, game["Clara"]);

        Assert.False(result.SessionRemoved);
        Assert.True(result.GameCompleted);
        Assert.Equal(LobbyStatus.Completed, game.Session.Status);
    }

    [Fact]
    public void Last_player_leaving_removes_the_session()
    {
        var game = TestGame.With("Anna");

        var result = game.Engine.RemovePlayer(game.Session, game["Anna"]);

        Assert.True(result.SessionRemoved);
        Assert.False(game.Storage.TryGetSession(game.Session.SessionId, out _));
    }

    [Fact]
    public void State_snapshots_have_increasing_versions()
    {
        var game = TestGame.With("Anna");

        var first = SessionStorage.ToDto(game.Session);
        var second = SessionStorage.ToDto(game.Session);

        Assert.True(second.StateVersion > first.StateVersion);
    }
}
