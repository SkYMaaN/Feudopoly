using Feudopoly.Server.Contracts;
using Feudopoly.Server.Multiplayer;
using Microsoft.AspNetCore.Mvc;

namespace Feudopoly.Server.Controllers;

[ApiController]
[Route("api/lobbies")]
public sealed class LobbiesController(SessionStorage sessionStorage) : ControllerBase
{
    [HttpGet]
    public ActionResult<IReadOnlyCollection<LobbyListItemDto>> GetLobbies([FromQuery] string? search = null)
    {
        var query = sessionStorage.GetSessions().AsEnumerable();
        if (!string.IsNullOrWhiteSpace(search))
        {
            query = query.Where(x => x.Name.Contains(search.Trim(), StringComparison.OrdinalIgnoreCase));
        }

        return Ok(query.Select(ToListItem).ToArray());
    }

    [HttpGet("{lobbyId:guid}")]
    public ActionResult<LobbyDetailsDto> GetLobby(Guid lobbyId)
    {
        if (!sessionStorage.TryGetSession(lobbyId, out var session) || session is null)
        {
            return NotFound();
        }

        lock (session)
        {
            return Ok(ToDetails(session));
        }
    }

    [HttpPost]
    public ActionResult<LobbyDetailsDto> CreateLobby([FromBody] CreateLobbyRequest request)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        try
        {
            var session = sessionStorage.CreateSession(
                request.Name,
                request.AccessType,
                request.Password,
                request.MaxPlayers,
                new PlayerState
                {
                    PlayerId = request.CreatorId,
                    DisplayName = request.CreatorName.Trim(),
                    IsMan = request.IsMan,
                    IsMuslim = request.IsMuslim,
                    Position = 0,
                    IsConnected = false,
                    IsDead = false,
                    TurnsToSkip = 0
                });

            return CreatedAtAction(nameof(GetLobby), new { lobbyId = session.SessionId }, ToDetails(session));
        }
        catch (InvalidDataException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("{lobbyId:guid}/join")]
    public IActionResult JoinLobby(Guid lobbyId, [FromBody] JoinLobbyRequest request)
    {
        if (!sessionStorage.TryGetSession(lobbyId, out var session) || session is null)
        {
            return NotFound();
        }

        try
        {
            sessionStorage.JoinLobby(session, request.PlayerId, request.DisplayName, request.IsMan, request.IsMuslim, request.Password);
            return Ok(ToDetails(session));
        }
        catch (InvalidDataException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("{lobbyId:guid}/leave")]
    public IActionResult LeaveLobby(Guid lobbyId, [FromBody] LeaveLobbyRequest request)
    {
        if (!sessionStorage.TryGetSession(lobbyId, out var session) || session is null)
        {
            return NotFound();
        }

        try
        {
            sessionStorage.LeaveLobby(session, request.PlayerId);
            return NoContent();
        }
        catch (InvalidDataException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("{lobbyId:guid}/start")]
    public IActionResult StartLobby(Guid lobbyId, [FromBody] StartLobbyRequest request)
    {
        if (!sessionStorage.TryGetSession(lobbyId, out var session) || session is null)
        {
            return NotFound();
        }

        try
        {
            sessionStorage.StartLobby(session, request.PlayerId);
            return Ok(ToDetails(session));
        }
        catch (InvalidDataException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    private static LobbyListItemDto ToListItem(GameSession session) => new()
    {
        LobbyId = session.SessionId,
        Name = session.Name,
        CurrentPlayers = session.Players.Count,
        MaxPlayers = session.MaxPlayers,
        Status = session.Status,
        AccessType = session.AccessType
    };

    private static LobbyDetailsDto ToDetails(GameSession session) => new()
    {
        LobbyId = session.SessionId,
        Name = session.Name,
        AccessType = session.AccessType,
        Status = session.Status,
        CurrentPlayers = session.Players.Count,
        MaxPlayers = session.MaxPlayers,
        OwnerPlayerId = session.OwnerPlayerId,
        Players = session.Players.Select(p => new LobbyPlayerDto
        {
            PlayerId = p.PlayerId,
            DisplayName = p.DisplayName,
            IsOwner = p.PlayerId == session.OwnerPlayerId,
            IsConnected = p.IsConnected
        }).ToArray()
    };
}
