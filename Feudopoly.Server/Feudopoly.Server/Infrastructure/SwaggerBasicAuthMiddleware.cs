using System.Net.Http.Headers;
using System.Text;
using Microsoft.Extensions.Options;

namespace Feudopoly.Server.Infrastructure;

public sealed class SwaggerBasicAuthMiddleware(RequestDelegate next, IOptions<SwaggerAdminOptions> options)
{
    private readonly RequestDelegate _next = next;
    private readonly SwaggerAdminOptions _options = options.Value;

    public async Task InvokeAsync(HttpContext context)
    {
        if (!_options.IsEnabled || !IsProtectedSwaggerRequest(context.Request.Path))
        {
            await _next(context);
            return;
        }

        if (!TryValidatePassword(context.Request, _options.Password!, out var challenge))
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            context.Response.Headers.WWWAuthenticate = challenge;
            await context.Response.WriteAsync("Swagger UI is protected.");
            return;
        }

        await _next(context);
    }

    private static bool IsProtectedSwaggerRequest(PathString path)
    {
        return path.StartsWithSegments($"/{SwaggerAdminOptions.UiRoutePrefix}", StringComparison.OrdinalIgnoreCase)
            || path.StartsWithSegments("/internal/ops/schema-a7f3c9", StringComparison.OrdinalIgnoreCase);
    }

    private static bool TryValidatePassword(HttpRequest request, string expectedPassword, out string challenge)
    {
        challenge = "Basic realm=\"Swagger Admin\"";

        if (!request.Headers.TryGetValue("Authorization", out var authorizationHeader))
        {
            return false;
        }

        if (!AuthenticationHeaderValue.TryParse(authorizationHeader, out var authHeader)
            || !"Basic".Equals(authHeader.Scheme, StringComparison.OrdinalIgnoreCase)
            || string.IsNullOrWhiteSpace(authHeader.Parameter))
        {
            return false;
        }

        string credentials;
        try
        {
            credentials = Encoding.UTF8.GetString(Convert.FromBase64String(authHeader.Parameter));
        }
        catch (FormatException)
        {
            return false;
        }

        var separatorIndex = credentials.IndexOf(':');
        if (separatorIndex < 0)
        {
            return false;
        }

        var password = credentials[(separatorIndex + 1)..];
        return string.Equals(password, expectedPassword, StringComparison.Ordinal);
    }
}
