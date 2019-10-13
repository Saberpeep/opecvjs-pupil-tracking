function loadOpenCV() {
    return new Promise((resolve, reject)=> {
        console.log("loading OpenCV...");
        //wait for opencv to trigger loaded hook
        cv['onRuntimeInitialized'] = () => {
            console.log("loaded OpenCV!")
            resolve();
        };
    })
}

loadOpenCV().then(main);

function main(){
    var video = document.createElement('video');
    document.body.append(video);
    var stream = null;
    var canvasInput = document.createElement('canvas');
    var canvasInputCtx = document.createElement('canvas').getContext('2d');
    var canvasOutput = document.querySelector('.canvas.cv');
    var canvasDebug = document.querySelector('.canvas.debug');
    var fpsEl = document.querySelector('.fps');
    var src = null;
    var dst = null;
    var cap = null;
    var worker = null;

    var utils = new Utils();

    initWorker().then((w) => {
        worker = w;
        initCam().then((s) => {
            stream = s;
            initVideoMats();
            utils.initFPSMeasure(fpsEl);
            // schedule the first one.
            sendNextFrameToWorker();
        })
    })

    function initCam(){
        return new Promise((resolve, reject) => {
            console.log("selecting cam stream...");
            navigator.mediaDevices.getUserMedia({ video: { height: 200, width: 200 }, audio: false })
            .then((stream) =>{
                var {width, height} = stream.getTracks()[0].getSettings();
                console.log("got stream with dimentions:", width, "x", height);
                video.onloadedmetadata = () =>{
                    console.log("loaded stream!");
                    video.height = video.videoHeight;
                    video.width = video.videoWidth;
                    video.play();
                    resolve(stream);
                }
                video.srcObject = stream;
            }).catch((e) =>{
                console.error("error getting cam", e);
                alert("error getting video feed, is a camera plugged in?");
                reject(e);
            });
        });
        
    }
    
    function initVideoMats(){
        src = new cv.Mat(video.height, video.width, cv.CV_8UC4);
        dst = new cv.Mat(video.height, video.width, cv.CV_8UC4);
        cap = new cv.VideoCapture(video);
    }

    function initWorker(){
        return new Promise((resolve, reject)=> {
            var myWorker = new Worker('eye-tracker-worker.js');
            myWorker.onmessage = function (e) {
                var msg = e.data;
                console.log('Message received from worker', msg);
                var msg = e.data;
                if (msg.command){
                    if (msg.command == 'lastFrame'){
                        //read next frame
                        cv.imshow(canvasOutput, dst);
                        cap.read(src);
                        //send next frame to worker
                        sendNextFrameToWorker();
                    }else if(msg.command == 'initDone'){
                        resolve(myWorker);
                    }
                }
            }
        });
    }

    function sendNextFrameToWorker(){
        canvasInputCtx.drawImage(video, 0, 0, video.width, video.height);
        var buffer = canvasInputCtx.getImageData(0, 0, canvasInput.width, canvasInput.height).data.buffer;
        worker.postMessage({ 
            command: 'nextFrame',
            buf: buffer,
            width: video.width,
            height: video.height,
        }, [buffer]);
    }

    function cleanup(){
        // OpenCV js requires manual garbage collection
        src.delete();
        dst.delete();
        gray.delete();
        faceClassifier.delete();
        faces.delete();
        face.delete();
        faceL.delete();
        faceR.delete();
        eyeClassifier.delete();
        eyesL.delete();
        eyesR.delete();
        eye.delete();
        pupils.delete();
        candidate.delete();
        contours.delete();
        hierarchy.delete();
        nose.delete();
        noses.delete();
    }
    window.addEventListener('beforeunload', () => {
        killCV();
    })
    window.killCV = function(){
        stream.getTracks()[0].stop();
        canvasOutput.getContext('2d').clearRect(0, 0, canvasOutput.width, canvasOutput.height);
        canvasDebug.getContext('2d').clearRect(0, 0, canvasDebug.width, canvasDebug.height);
        cv_running = false;
        cleanup();
    }
}
