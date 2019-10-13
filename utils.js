function Utils(){

    this.createFileFromUrl = function (path, url, callback) {
        let request = new XMLHttpRequest();
        request.open('GET', url, true);
        request.responseType = 'arraybuffer';
        request.onload = function(ev) {
            if (request.readyState === 4) {
                if (request.status === 200) {
                    let data = new Uint8Array(request.response);
                    cv.FS_createDataFile('/', path, data, true, false, false);
                    callback();
                } else {
                    self.printError('Failed to load ' + url + ' status: ' + request.status);
                }
            }
        };
        request.send();
    };

    //Measure FPS - used to adjust durations so seconds accurately represent real seconds
    var lastFrameStartTime = performance.now();
    var fpsData = {
        fps: 0,
    }
    function fpsMeasure(now){
        fpsData.fps = 1000 / (now - lastFrameStartTime);
        lastFrameStartTime = now;

        requestAnimationFrame(fpsMeasure);
    }


    this.initFPSMeasure = function (){
        lastFrameStartTime = performance.now();
        requestAnimationFrame(fpsMeasure);
        return fpsData;
    }

}