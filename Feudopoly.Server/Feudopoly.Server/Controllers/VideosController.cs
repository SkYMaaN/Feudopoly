using System.Net;
using System.Text.RegularExpressions;
using Feudopoly.Server.Infrastructure;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace Feudopoly.Server.Controllers;

[ApiController]
[Route("api/videos")]
public sealed partial class VideosController(
    R2ObjectClient r2ObjectClient,
    IOptions<R2Options> r2Options,
    ILogger<VideosController> logger) : ControllerBase
{
    [HttpGet("{videoKey}")]
    [HttpGet("{videoKey}.mp4")]
    public async Task<IActionResult> GetVideo(string videoKey, CancellationToken cancellationToken)
    {
        if (!VideoKeyRegex().IsMatch(videoKey))
        {
            return BadRequest(new { message = "Invalid video key." });
        }

        var options = r2Options.Value;
        if (!options.IsConfigured)
        {
            logger.LogError("R2 video storage is not configured.");
            return Problem("Video storage is not configured.", statusCode: StatusCodes.Status503ServiceUnavailable);
        }

        using var r2Response = await GetR2Response(videoKey, cancellationToken);
        if (r2Response is null)
        {
            if (cancellationToken.IsCancellationRequested)
            {
                return new EmptyResult();
            }

            return StatusCode(StatusCodes.Status502BadGateway, new { message = "Failed to read video storage." });
        }

        if (r2Response.StatusCode == HttpStatusCode.NotFound)
        {
            return NotFound();
        }

        if (r2Response.StatusCode == HttpStatusCode.RequestedRangeNotSatisfiable)
        {
            CopyRangeHeaders(r2Response);
            return StatusCode(StatusCodes.Status416RangeNotSatisfiable);
        }

        if (!r2Response.IsSuccess)
        {
            logger.LogWarning(
                "R2 returned {StatusCode} ({ErrorCode}) for video key {VideoKey}.",
                (int)r2Response.StatusCode,
                r2Response.ErrorCode,
                videoKey);

            return StatusCode(StatusCodes.Status502BadGateway, new { message = "Video storage rejected the request." });
        }

        await CopyVideoResponse(r2Response, cancellationToken);
        return new EmptyResult();
    }

    private async Task<R2ObjectResult?> GetR2Response(string videoKey, CancellationToken cancellationToken)
    {
        try
        {
            var objectKey = r2Options.Value.BuildVideoObjectKey(videoKey);
            return await r2ObjectClient.GetObjectAsync(objectKey, Request.Headers.Range.ToString(), cancellationToken);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            logger.LogDebug("Video request for {VideoKey} was canceled before R2 returned a response.", videoKey);
            return null;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to fetch video key {VideoKey} from R2.", videoKey);
            return null;
        }
    }

    private async Task CopyVideoResponse(R2ObjectResult r2Response, CancellationToken cancellationToken)
    {
        Response.StatusCode = (int)r2Response.StatusCode;
        Response.ContentType = r2Response.ContentType ?? "video/mp4";

        if (r2Response.ContentLength is { } contentLength)
        {
            Response.ContentLength = contentLength;
        }

        CopyRangeHeaders(r2Response);

        if (r2Response.ETag is { } etag)
        {
            Response.Headers["ETag"] = etag;
        }

        if (r2Response.LastModified is { } lastModified)
        {
            Response.Headers["Last-Modified"] = lastModified.ToString("R");
        }

        Response.Headers["Cache-Control"] = "public, max-age=3600";

        try
        {
            await r2Response.ResponseStream.CopyToAsync(Response.Body, cancellationToken);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            logger.LogDebug("Video stream for {Path} was canceled by the client.", Request.Path);
        }
        catch (IOException ex) when (cancellationToken.IsCancellationRequested)
        {
            logger.LogDebug(ex, "Video stream for {Path} was closed by the client.", Request.Path);
        }
    }

    private void CopyRangeHeaders(R2ObjectResult r2Response)
    {
        Response.Headers["Accept-Ranges"] = string.IsNullOrWhiteSpace(r2Response.AcceptRanges)
            ? "bytes"
            : r2Response.AcceptRanges;

        if (!string.IsNullOrWhiteSpace(r2Response.ContentRange))
        {
            Response.Headers["Content-Range"] = r2Response.ContentRange;
        }
    }

    [GeneratedRegex("^[A-Za-z0-9_-]+$", RegexOptions.CultureInvariant)]
    private static partial Regex VideoKeyRegex();
}
