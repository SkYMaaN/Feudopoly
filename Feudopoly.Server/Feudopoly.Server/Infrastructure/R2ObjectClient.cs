using System.Net;
using Amazon.Runtime;
using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.Extensions.Options;

namespace Feudopoly.Server.Infrastructure;

public sealed class R2ObjectClient(IOptions<R2Options> options)
{
    private static readonly char[] HeaderWhitespace = [' ', '\t', '\r', '\n'];

    public async Task<R2ObjectResult> GetObjectAsync(
        string objectKey,
        string? rangeHeader,
        CancellationToken cancellationToken)
    {
        var r2Options = options.Value;
        if (!r2Options.IsConfigured)
        {
            throw new InvalidOperationException("R2 video storage is not configured.");
        }

        var client = CreateClient(r2Options);
        try
        {
            var request = new GetObjectRequest
            {
                BucketName = r2Options.BucketName,
                Key = objectKey
            };

            var normalizedRange = NormalizeRangeHeader(rangeHeader);
            if (!string.IsNullOrWhiteSpace(normalizedRange))
            {
                request.ByteRange = new ByteRange(normalizedRange);
            }

            var response = await client.GetObjectAsync(request, cancellationToken);
            return R2ObjectResult.Success(client, response);
        }
        catch (AmazonS3Exception ex)
        {
            client.Dispose();
            return R2ObjectResult.Error(ex.StatusCode, ex.ErrorCode);
        }
        catch
        {
            client.Dispose();
            throw;
        }
    }

    private static string? NormalizeRangeHeader(string? rangeHeader)
    {
        if (string.IsNullOrWhiteSpace(rangeHeader))
        {
            return null;
        }

        var normalized = NormalizeHeaderValue(rangeHeader);
        return normalized.StartsWith("bytes=", StringComparison.OrdinalIgnoreCase)
            ? normalized
            : null;
    }

    private static AmazonS3Client CreateClient(R2Options options)
    {
        var credentials = new BasicAWSCredentials(options.AccessKeyId, options.SecretAccessKey);
        var config = new AmazonS3Config
        {
            ServiceURL = options.Endpoint!.TrimEnd('/'),
            AuthenticationRegion = options.EffectiveRegion,
            ForcePathStyle = true
        };

        return new AmazonS3Client(credentials, config);
    }

    private static string NormalizeHeaderValue(string value) =>
        string.Join(' ', value.Trim().Split(HeaderWhitespace, StringSplitOptions.RemoveEmptyEntries));
}

public sealed class R2ObjectResult : IDisposable
{
    private readonly IAmazonS3? client;
    private readonly GetObjectResponse? response;

    private R2ObjectResult(IAmazonS3 client, GetObjectResponse response)
    {
        this.client = client;
        this.response = response;
        StatusCode = response.HttpStatusCode;
    }

    private R2ObjectResult(HttpStatusCode statusCode, string? errorCode)
    {
        StatusCode = statusCode;
        ErrorCode = errorCode;
    }

    public HttpStatusCode StatusCode { get; }

    public string? ErrorCode { get; }

    public bool IsSuccess => response is not null && (int)StatusCode is >= 200 and <= 299;

    public string? ContentType => response?.Headers.ContentType;

    public long? ContentLength => response?.Headers.ContentLength;

    public string? ContentRange => response?.ContentRange;

    public string? AcceptRanges => response?.AcceptRanges;

    public string? ETag => response?.ETag;

    public DateTime? LastModified => response?.LastModified;

    public Stream ResponseStream => response?.ResponseStream ?? Stream.Null;

    public static R2ObjectResult Success(IAmazonS3 client, GetObjectResponse response) => new(client, response);

    public static R2ObjectResult Error(HttpStatusCode statusCode, string? errorCode) => new(statusCode, errorCode);

    public void Dispose()
    {
        response?.Dispose();
        client?.Dispose();
    }
}
