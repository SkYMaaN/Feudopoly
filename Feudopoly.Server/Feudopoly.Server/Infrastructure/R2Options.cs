namespace Feudopoly.Server.Infrastructure;

public sealed class R2Options
{
    public const string SectionName = "R2";

    public string? Endpoint { get; set; }

    public string? BucketName { get; set; }

    public string? AccessKeyId { get; set; }

    public string? SecretAccessKey { get; set; }

    public string? Region { get; set; } = "auto";

    public string? Folder { get; set; } = "FeudopolyVideos";

    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(Endpoint)
        && !string.IsNullOrWhiteSpace(BucketName)
        && !string.IsNullOrWhiteSpace(AccessKeyId)
        && !string.IsNullOrWhiteSpace(SecretAccessKey);

    public string EffectiveRegion => string.IsNullOrWhiteSpace(Region) ? "auto" : Region.Trim();

    public string BuildVideoObjectKey(string videoKey)
    {
        var fileName = $"{videoKey}.mp4";
        var folder = (Folder ?? string.Empty).Trim('/');

        return string.IsNullOrWhiteSpace(folder)
            ? fileName
            : $"{folder}/{fileName}";
    }
}
