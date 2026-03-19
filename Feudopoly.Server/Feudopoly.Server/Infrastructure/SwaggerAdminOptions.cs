namespace Feudopoly.Server.Infrastructure;

public sealed class SwaggerAdminOptions
{
    public const string PasswordEnvironmentVariable = "SWAGGER_ADMIN_PASSWORD";

    public const string UiRoutePrefix = "internal/ops/console-a7f3c9";
    public const string JsonRouteTemplate = "internal/ops/schema-a7f3c9/{documentName}/openapi.json";
    public const string JsonEndpoint = "/internal/ops/schema-a7f3c9/v1/openapi.json";

    public string? Password { get; set; }

    public bool IsEnabled => !string.IsNullOrWhiteSpace(Password);
}
