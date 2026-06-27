(function(){"use strict";self.onmessage=s=>{s.data==="start"&&setInterval(()=>{self.postMessage("tick")},6e4)}})();
