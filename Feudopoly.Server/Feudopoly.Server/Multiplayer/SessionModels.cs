namespace Feudopoly.Server.Multiplayer;

public enum LobbyAccessType
{
    Open = 0,
    Closed = 1
}

public enum LobbyStatus
{
    WaitingForPlayers = 0,
    Ready = 1,
    Launching = 2,
    InProgress = 3,
    Completed = 4
}
