using Feudopoly.Server.Contracts;
using Feudopoly.Server.Hubs;
using Feudopoly.Server.Infrastructure;
using Feudopoly.Server.Multiplayer;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Options;
using static Feudopoly.Server.Contracts.LobbyMappings;

namespace Feudopoly.Server.Controllers;

[ApiController]
[Route("api/lobbies")]
public sealed class LobbiesController(
    SessionStorage sessionStorage,
    IHubContext<LobbyHub> lobbyHub,
    GameNotifier gameNotifier,
    IOptions<SwaggerAdminOptions> adminOptions) : ControllerBase
{
    [HttpGet]
    [ProducesResponseType(typeof(IReadOnlyCollection<LobbyListItemDto>), StatusCodes.Status200OK)]
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
    [ProducesResponseType(typeof(LobbyDetailsDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
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
    [ProducesResponseType(typeof(LobbyDetailsDto), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<LobbyDetailsDto>> CreateLobby([FromBody] CreateLobbyRequest request)
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
                    PlayerKey = request.CreatorKey,
                    DisplayName = request.CreatorName.Trim(),
                    IsWomen = request.IsWomen,
                    IsMuslim = request.IsMuslim,
                    Position = 0,
                    IsConnected = false,
                    IsDead = false,
                    IsSpectator = false,
                    IsWinner = false,
                    TurnsToSkip = 0
                });

            if (request.MaxPlayers == 1)
            {
                await StartAndNotifyAsync(session, request.CreatorId, request.CreatorKey);
            }
            else
            {
                await NotifyLobbyListChanged(lobbyHub, session);
            }

            return CreatedAtAction(nameof(GetLobby), new { lobbyId = session.SessionId }, ToDetails(session));
        }
        catch (InvalidDataException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("{lobbyId:guid}/join")]
    [ProducesResponseType(typeof(LobbyDetailsDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiErrorDto), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiErrorDto), StatusCodes.Status409Conflict)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> JoinLobby(Guid lobbyId, [FromBody] JoinLobbyRequest request)
    {
        if (!sessionStorage.TryGetSession(lobbyId, out var session) || session is null)
        {
            return NotFound();
        }

        try
        {
            sessionStorage.JoinLobby(session, request.PlayerId, request.PlayerKey, request.DisplayName, request.IsWomen, request.IsMuslim, request.Password);
            await NotifyLobbyUpdated(lobbyHub, session);
            await NotifyLobbyListChanged(lobbyHub, session);
            return Ok(ToDetails(session));
        }
        catch (InvalidDataException ex)
        {
            if (string.Equals(ex.Message, "Session is full.", StringComparison.Ordinal))
            {
                return Conflict(new ApiErrorDto
                {
                    Code = "lobby_full",
                    Message = "Lobby is already full. No free slots left."
                });
            }

            return BadRequest(new ApiErrorDto
            {
                Message = ex.Message
            });
        }
    }

    [HttpPost("{lobbyId:guid}/leave")]
    public async Task<IActionResult> LeaveLobby(Guid lobbyId, [FromBody] LeaveLobbyRequest request)
    {
        if (!sessionStorage.TryGetSession(lobbyId, out var session) || session is null)
        {
            return NotFound();
        }

        try
        {
            var removed = sessionStorage.LeaveLobby(session, request.PlayerId, request.PlayerKey);
            if (removed)
            {
                await gameNotifier.LobbyDeletedAsync(lobbyId);
                return NoContent();
            }

            await NotifyLobbyUpdated(lobbyHub, session);
            await NotifyLobbyListChanged(lobbyHub, session);
            return NoContent();
        }
        catch (InvalidDataException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { message = ex.Message });
        }
    }

    [HttpPost("{lobbyId:guid}/start")]
    public async Task<IActionResult> StartLobby(Guid lobbyId, [FromBody] StartLobbyRequest request)
    {
        if (!sessionStorage.TryGetSession(lobbyId, out var session) || session is null)
        {
            return NotFound();
        }

        try
        {
            await StartAndNotifyAsync(session, request.PlayerId, request.PlayerKey);
            return Ok(ToDetails(session));
        }
        catch (InvalidDataException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { message = ex.Message });
        }
    }

    /// <summary>Admin-only: requires Basic auth with the Swagger admin password.</summary>
    [HttpDelete("{lobbyId:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> DeleteLobby(Guid lobbyId)
    {
        var options = adminOptions.Value;
        if (!options.IsEnabled || !SwaggerBasicAuthMiddleware.TryValidatePassword(Request, options.Password!, out _))
        {
            return Unauthorized();
        }

        if (!sessionStorage.TryGetSession(lobbyId, out var session) || session is null)
        {
            return NotFound();
        }

        if (!sessionStorage.DeleteLobby(session))
        {
            return NotFound();
        }

        await gameNotifier.LobbyDeletedAsync(lobbyId);
        return NoContent();
    }

    private async Task StartAndNotifyAsync(GameSession session, Guid playerId, string playerKey)
    {
        sessionStorage.StartLobby(session, playerId, playerKey);
        await NotifyLobbyUpdated(lobbyHub, session);
        await NotifyLobbyListChanged(lobbyHub, session);
    }

    internal static Task NotifyLobbyUpdated(IHubContext<LobbyHub> lobbyHub, GameSession session)
    {
        LobbyDetailsDto details;
        lock (session)
        {
            details = ToDetails(session);
        }

        return lobbyHub.Clients.Group(session.SessionId.ToString()).SendAsync("LobbyUpdated", details);
    }

    internal static Task NotifyLobbyListChanged(IHubContext<LobbyHub> lobbyHub, GameSession session)
    {
        LobbyListItemDto item;
        lock (session)
        {
            item = ToListItem(session);
        }

        return lobbyHub.Clients.Group(LobbyHub.LobbyListGroup).SendAsync("LobbyListChanged", item);
    }
}
