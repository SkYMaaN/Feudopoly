using Feudopoly.Server.Lobbies;
using Microsoft.AspNetCore.Mvc;

namespace Feudopoly.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
public sealed class LobbiesController(LobbyService lobbyService) : ControllerBase
{
    [HttpGet]
    public ActionResult<IReadOnlyCollection<LobbySummaryDto>> List([FromQuery] string? search = null)
    {
        return Ok(lobbyService.List(search));
    }

    [HttpGet("{lobbyId:guid}")]
    public ActionResult<LobbyDetailsDto> Get([FromRoute] Guid lobbyId) => Execute(() => lobbyService.Get(lobbyId));

    [HttpPost]
    public ActionResult<LobbyDetailsDto> Create([FromBody] CreateLobbyRequest request)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        return Execute(() => lobbyService.Create(request));
    }

    [HttpPost("{lobbyId:guid}/join")]
    public ActionResult<LobbyDetailsDto> Join([FromRoute] Guid lobbyId, [FromBody] JoinLobbyRequest request)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        return Execute(() => lobbyService.Join(lobbyId, request));
    }

    [HttpPost("{lobbyId:guid}/leave")]
    public IActionResult Leave([FromRoute] Guid lobbyId, [FromBody] LeaveLobbyRequest request)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        try
        {
            lobbyService.Leave(lobbyId, request.UserId);
            return NoContent();
        }
        catch (KeyNotFoundException exception)
        {
            return NotFound(new { error = exception.Message });
        }
        catch (InvalidOperationException exception)
        {
            return BadRequest(new { error = exception.Message });
        }
    }

    [HttpPost("{lobbyId:guid}/status/{status}")]
    public IActionResult SetStatus([FromRoute] Guid lobbyId, [FromRoute] LobbyStatus status)
    {
        try
        {
            lobbyService.SetStatus(lobbyId, status);
            return NoContent();
        }
        catch (KeyNotFoundException exception)
        {
            return NotFound(new { error = exception.Message });
        }
    }

    private ActionResult<T> Execute<T>(Func<T> action)
    {
        try
        {
            return Ok(action());
        }
        catch (KeyNotFoundException exception)
        {
            return NotFound(new { error = exception.Message });
        }
        catch (InvalidOperationException exception)
        {
            return BadRequest(new { error = exception.Message });
        }
    }
}
