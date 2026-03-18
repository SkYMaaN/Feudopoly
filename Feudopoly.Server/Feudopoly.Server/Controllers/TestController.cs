using Microsoft.AspNetCore.Cors;
using Microsoft.AspNetCore.Mvc;

namespace Feudopoly.Server.Controllers
{
    [ApiController]
    [Route("test")]
    [EnableCors(Program.OpenCorsPolicy)]
    public class TestController : ControllerBase
    {
        [HttpGet]
        public ContentResult Get()
        {
            return Content("всё работает", "text/plain; charset=utf-8");
        }
    }
}
