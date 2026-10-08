using Feudopoly.Server.Multiplayer;

namespace Feudopoly.Server.Tests;

internal sealed class ScriptedDice : IDiceRoller
{
    private readonly Queue<int> _rolls = new();

    public void Enqueue(params int[] rolls)
    {
        foreach (var roll in rolls)
        {
            _rolls.Enqueue(roll);
        }
    }

    public int Roll() => _rolls.Count > 0
        ? _rolls.Dequeue()
        : throw new InvalidOperationException("No scripted dice roll left.");
}

/// <summary>Builds a started game with joined players.</summary>
internal sealed class TestGame
{
    public SessionStorage Storage { get; } = new();
    public EventStorage Events { get; } = new();
    public ScriptedDice Dice { get; } = new();
    public GameEngine Engine { get; }
    public GameSession Session { get; }

    private TestGame(params (string Name, bool IsWomen, bool IsMuslim)[] players)
    {
        Engine = new GameEngine(Storage, Events, Dice);

        var owner = players[0];
        Session = Storage.CreateSession("Test lobby", LobbyAccessType.Open, null, Math.Max(players.Length, 1), NewPlayer(owner.Name, owner.IsWomen, owner.IsMuslim));
        foreach (var (name, isWomen, isMuslim) in players.Skip(1))
        {
            Storage.JoinLobby(Session, Guid.NewGuid(), KeyFor(name), name, isWomen, isMuslim, null);
        }

        Storage.StartLobby(Session, Session.OwnerPlayerId, KeyFor(owner.Name));
        foreach (var player in Session.Players)
        {
            Engine.JoinPlayer(Session, player, $"conn-{player.DisplayName}");
        }
    }

    public static TestGame With(params string[] names) => new(names.Select(name => (name, false, false)).ToArray());

    public static TestGame With(params (string Name, bool IsWomen, bool IsMuslim)[] players) => new(players);

    public PlayerState this[string name] => Session.Players.Single(p => p.DisplayName == name);

    public PlayerState Active => Session.Players.Single(p => p.PlayerId == Session.ActiveTurnPlayerId);

    /// <summary>Puts the player on <paramref name="cell"/> as if they had just rolled onto it.</summary>
    public PlayerState StandOn(string name, int cell)
    {
        var player = this[name];
        player.Position = cell;
        Session.ActiveTurnPlayerId = player.PlayerId;
        Session.IsTurnInProgress = true;
        return player;
    }

    public static string KeyFor(string name) => $"key-{name}-0123456789abcdef";

    private static PlayerState NewPlayer(string name, bool isWomen, bool isMuslim) => new()
    {
        PlayerId = Guid.NewGuid(),
        PlayerKey = KeyFor(name),
        DisplayName = name,
        IsWomen = isWomen,
        IsMuslim = isMuslim,
        Position = 0,
        IsConnected = false,
        IsDead = false,
        IsSpectator = false,
        IsWinner = false,
        TurnsToSkip = 0
    };
}
