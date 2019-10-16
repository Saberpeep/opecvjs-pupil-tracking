
function loadOpenCV() {
    return new Promise((resolve, reject)=> {
        console.log("loading OpenCV...");
        // wait for opencv to trigger loaded hook
        cv['onRuntimeInitialized'] = () => {
            console.log("loaded OpenCV!")
            resolve();
        };
    })
}
function main(){
    var PUPIL_DETECTION_METHOD = "contour"; //or "hough";
    var video = document.createElement('video');
    // document.body.append(video); // for debugging webcam feed
    var stream = null;
    var canvasOutput = document.querySelector('canvas.cv');
    var canvasDebug = document.querySelector('canvas.debug');
    var dbg = new cv.Mat(200, 200, cv.CV_8UC4);
    var fpsEl = document.querySelector('.fps');
    var fpsMeasure = null;
    var src = null;
    var dst = null;
    var gray = new cv.Mat();
    var cap = null;
    var faceClassifier = new cv.CascadeClassifier();
    var faceProfileClassifier = new cv.CascadeClassifier();
    var faceCandidate = new cv.Mat();
    var faces = new cv.RectVector();
    var face = new cv.Mat();
    var faceR = new cv.Mat();
    var faceL = new cv.Mat();
    var faceLower = new cv.Mat();
    var eyeClassifier = new cv.CascadeClassifier();
    var eyesR = new cv.RectVector();
    var eyesL = new cv.RectVector();
    var eye = new cv.Mat();
    if (PUPIL_DETECTION_METHOD == "hough")
        var pupils = new cv.Mat();
    if (PUPIL_DETECTION_METHOD == "contour")
        var pupils = new cv.RectVector();
    var eyeCandidate = new cv.Mat();
    var pupilContours = new cv.MatVector();
    var hierarchy = new cv.Mat();
    var stabilizeCache = {};
    var mouthClassifier = new cv.CascadeClassifier();
    var mouths = new cv.RectVector();
    var mouth = new cv.Mat();
    var cv_running = false;
    var bc = new BroadcastChannel('faceRig');
    var TAU = 6.283185307179586;
    var garbage = [
        dbg,
        src,
        dst,
        gray,
        cap,
        faceClassifier,
        faceProfileClassifier,
        faceCandidate,
        faces,
        face,
        faceR,
        faceL,
        faceLower,
        eyeClassifier,
        eyesR,
        eyesL,
        eye,
        pupils,
        eyeCandidate,
        pupilContours,
        hierarchy,
        stabilizeCache,
        mouthClassifier,
        mouths,
        mouth,
    ]

    var utils = new Utils();

    function loadCascadeFile(classifier,url){
        return new Promise((resolve,reject)=>{
            // use createFileFromUrl to pre-load the xml
            utils.createFileFromUrl(url, url, () => {
                classifier.load(url); // in the callback, load the cascade from file 
                resolve();
            });
        });
    }

    // load pre-trained classifiers
    var cascadeLoads = [
        loadCascadeFile(faceClassifier, 'haarcascade_frontalface_alt.xml'),
        loadCascadeFile(faceProfileClassifier, 'haarcascade_profileface.xml'),
        loadCascadeFile(eyeClassifier, 'haarcascade_eye_tree_eyeglasses.xml'),
        loadCascadeFile(mouthClassifier, 'haarcascade_mouth_modesto.xml'),
    ];

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

    function processVideo() {
        if (!cv_running) return;
        // start processing.
        cap.read(src);
        src.copyTo(dst);
        // flip image horizontally
        cv.flip(dst, dst, +1);
        // convert to grayscale
        cv.cvtColor(dst, gray, cv.COLOR_RGBA2GRAY, 0);
        
        detectFaces(gray, faces);
        if (faces.size()){
            var faceRect = stabilizeAndSet(faces, "face", 0, 5);
            drawFaces(faces);
            face = gray.roi(faceRect);
            var faceRectR = new cv.Rect(0, 0, faceRect.width / 2, faceRect.height);
            var faceRectL = new cv.Rect(faceRect.width / 2, 0, faceRect.width / 2, faceRect.height);
            faceR = face.roi(faceRectR);
            faceL = face.roi(faceRectL);
            detectEyes(faceR, eyesR);
            detectEyes(faceL, eyesL);

            var eyeRectR = stabilizeAndSet(eyesR, "eyeR", 0, 5, faceRectR);

            if(eyesR.size()){
                drawEyes(faceRect, faceRectR, eyesR);
                try{
                    eye = faceR.roi(eyeRectR);
                }catch(e){
                    console.warn("eyeRect out of range? stabilization error?", e);
                }finally{
                    // -- by contours -----------------
                    if (PUPIL_DETECTION_METHOD == "contour"){
                        pupils = detectPupilsContours(eye);
                        stabilizeAndSet(pupils, "pupilR", 0, 10, eyeRectR);
                        var parsedPupils = rectVToParsedCircles(pupils);
                    }
                    // -- by hough circles ----------------
                    else if (PUPIL_DETECTION_METHOD == "hough"){
                        detectPupilsHough(eye, pupils);
                        var parsedPupils = parseHoughCircles(pupils);
                    }
                    drawPupils(faceRect, faceRectR, eyeRectR, parsedPupils);
                    var pupilR = parsedPupils[0];
                }
            }

            var eyeRectL = stabilizeAndSet(eyesL, "eyeL", 0, 5, faceRectL);

            if(eyesL.size()){
                drawEyes(faceRect, faceRectL, eyesL);
                eye = faceL.roi(eyeRectL);
                // -- by contours -----------------
                if (PUPIL_DETECTION_METHOD == "contour"){
                    pupils = detectPupilsContours(eye);
                    stabilizeAndSet(pupils, "pupilL", 0, 10, eyeRectL);
                    var parsedPupils = rectVToParsedCircles(pupils);
                }
                // -- by hough circles ----------------
                else if (PUPIL_DETECTION_METHOD == "hough"){
                    detectPupilsHough(eye, pupils);
                    var parsedPupils = parseHoughCircles(pupils);
                }
                drawPupils(faceRect, faceRectL, eyeRectL, parsedPupils);
                var pupilL = parsedPupils[0];
            }
            var faceRectLower = new cv.Rect(0, faceRect.height / 2, faceRect.width, faceRect.height / 2);
            faceLower = face.roi(faceRectLower);
            detectMouths(faceLower, mouths);
            if (mouths.size()){
                var mouthRect = mouths.get(0);
                mouthRect = stabilizeRect(mouthRect, "mouth0", 5);
                mouths.set(0, mouthRect);
                drawMouths(faceRect, faceRectLower, mouths);
            }
            var faceRigData = parseFacePositions(video, faceRect, faceRectR, faceRectL, faceRectLower, eyeRectL ,eyeRectR, pupilR, pupilL, mouthRect);
            sendFaceRigData(faceRigData);

        }

        // output to canvas
        cv.imshow(canvasOutput, dst);
        try{
            // output to secondary debug canvas
            cv.imshow(canvasDebug, eyeCandidate);
        }catch(e){
            // ignore, debug mat probably not ready yet
        }finally{
            // schedule the next one.
            drawFps();
            requestAnimationFrame(processVideo);
        }
    };

    function detectFaces(inMat, outRectV){
        // detect faces.
        if (!inMat) throw "missing Mat";
        if (!outRectV) throw "missing output";
        // (inputImage, foundObjects, scaleFactor, minNumNeigbors(aka threshhold), flags, minSize(of object), maxSize(of object))
        faceClassifier.detectMultiScale(gray, outRectV, 1.1, 6, 0, new cv.Size(video.width / 3));
        // if we didnt find any, try detecting faces looking sideways (profile)
        if (!outRectV.size()){
            faceProfileClassifier.detectMultiScale(gray, outRectV, 1.1, 6, 0, new cv.Size(video.width / 3));
        }
        // if we still didnt find any, flip and try again (faceProfileClassifier only works for one side)
        if (!outRectV.size()){
            cv.flip(gray, faceCandidate, +1);
            faceProfileClassifier.detectMultiScale(faceCandidate, outRectV, 1.1, 6, 0, new cv.Size(video.width / 3));
            flipRectV(outRectV, inMat);
        }
        // if we still didnt find anything, try rotating and try again
        // DISABLED FOR PERFORMANCE REASONS, warpAffine takes too long
        // if (!outRectV.size()){
        //     for (var i = -1; i <= 1 && !outRectV.size(); i += 0.5){
        //         console.log(i);
        //         rotateMat(gray, faceCandidate, 45 * i);
        //         faceClassifier.detectMultiScale(faceCandidate, outRectV, 1.1, 6, 0, new cv.Size(video.width / 3));
        //     }
        // }
        
    }
    function drawFaces(facesRectV){
        // draw faces.
        for (var i = 0; i < facesRectV.size(); ++i) {
            var faceRect = facesRectV.get(i);
            var point1 = new cv.Point(faceRect.x, faceRect.y);
            var point2 = new cv.Point(faceRect.x + faceRect.width, faceRect.y + faceRect.height);
            var a = (i == 0)? 255 : 100;
            cv.rectangle(dst, point1, point2, [255, 0, 0, a]);
        }
    }
    function detectEyes(faceHMat, outRectV){
        // detect eyes
        if (!faceHMat) throw "missing Mat";
        if (!outRectV) throw "missing output";
        var eyeMinSize = faceHMat.cols / 5;
        var eyeMaxSize = faceHMat.cols / 2;
        eyeClassifier.detectMultiScale(faceHMat, outRectV, 1.1, 1.5, 0, new cv.Size(eyeMinSize, eyeMinSize), new cv.Size(eyeMaxSize, eyeMaxSize));
        
    }
    function drawEyes(faceRect, faceHRect, eyesRectV){
        // draw eyes.
        for (var i = 0; i < eyesRectV.size(); ++i) {
            var eyeRect = eyesRectV.get(i);
            var x = faceRect.x + faceHRect.x + eyeRect.x;
            var y = faceRect.y + eyeRect.y;
            var point1 = new cv.Point(x, y);
            var point2 = new cv.Point(x + eyeRect.width, y + eyeRect.height);
            var a = (i == 0)? 255 : 100;
            cv.rectangle(dst, point1, point2, [0, 0, 255, a]);
        }
    }
    function detectPupilsHough(eyeMat, outMat){
        // detect pupils using circle finding
        if (!eyeMat) throw "missing Mat";
        var pupilMinSize = eyeMat.cols / 10;
        var pupilMaxSize = eyeMat.cols / 3;
        // ------------
        // Feel free to play around with the threshold settings to get better results, 
        // but careful that the second to last param on adaptive threshold is an odd number.
        //
        // cv.threshold(eyeMat, candidate, 70, 255, cv.THRESH_BINARY); // (more accurate, but only works in good lighting).
        // cv.adaptiveThreshold(eyeMat, candidate, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 71, 20); // (alternate settings)
        // cv.adaptiveThreshold(eyeMat, eyeCandidate, 255, cv.ADAPTIVE_THRESH_MEAN_C, cv.THRESH_BINARY, 101, 100);
        cv.adaptiveThreshold(eyeMat, eyeCandidate, 255, cv.ADAPTIVE_THRESH_MEAN_C, cv.THRESH_BINARY, 71, 100);
        // ------------
        var ksize = new cv.Size(13, 13); // blur amount
        cv.GaussianBlur(eyeCandidate, eyeCandidate, ksize, 0, 0, cv.BORDER_DEFAULT);
        cv.HoughCircles(eyeCandidate, outMat, cv.HOUGH_GRADIENT, 1, eyeMat.cols / 8, 250, 15, pupilMinSize, pupilMaxSize);
    }
    function drawPupils(faceRect, faceHRect, eyeRect, pupilsArr){
        for (var i = 0; i < pupilsArr.length; ++i) {
            var pupil = pupilsArr[i];
            var x = pupil.center.x + faceRect.x + faceHRect.x + eyeRect.x;
            var y = pupil.center.y + faceRect.y + faceHRect.y + eyeRect.y;
            var adjCenter = new cv.Point(x, y);
            var a = (i == 0)? 255 : 100;
            cv.circle(dst, adjCenter, pupil.radius, [0, 255, 0, a]);
        }
    }
    function detectPupilsContours(eyeMat){
        // detect pupils using circle finding
        if (!eyeMat) throw "missing Mat";

        cv.adaptiveThreshold(eyeMat, eyeCandidate, 255, cv.ADAPTIVE_THRESH_MEAN_C, cv.THRESH_BINARY, 71, 100);
        var blur_amount = 13;
        cv.GaussianBlur(eyeCandidate, eyeCandidate, new cv.Size(blur_amount, blur_amount), 0, 0, cv.BORDER_DEFAULT);
        cv.threshold(eyeCandidate, eyeCandidate, 0, 255, cv.THRESH_BINARY || cv.THRESH_OTSU);

        cv.findContours(eyeCandidate, pupilContours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_NONE);
        cv.drawContours(dst, pupilContours, 0, [255,255,255,255], 1, cv.LINE_8, hierarchy, 0);

        var outRectV = new cv.RectVector();

        for (var i = 0; i < pupilContours.size(); i++) {
            var area = cv.contourArea(pupilContours.get(i));
            var rect = cv.boundingRect(pupilContours.get(i));
            var radius = rect.width / 2;

            var sizeRate = rect.width / eyeMat.cols;

            // If contour: has round shape and has a specific size relation
            // Then it is the pupil
            if (sizeRate >= 0.3 && sizeRate <= 0.9 // Size check
                && Math.abs(1 - (rect.width / rect.height)) <= 0.5 // Square dimentions check
                && Math.abs(1 - (area / (Math.PI * Math.pow(radius, 2)))) <= 0.7 // Round shape check
            ){
                outRectV.push_back(rect);
            }
        }
        return outRectV;
        
    }
    function detectMouths(faceMat, outRectV){
        // detect eyes
        if (!faceMat) throw "missing Mat";
        if (!outRectV) throw "missing output";
        var minSize = faceMat.cols / 10;
        var maxSize = faceMat.cols / 3;
        mouthClassifier.detectMultiScale(faceMat, outRectV, 1.1, 10, 0, new cv.Size(minSize, minSize), new cv.Size(maxSize, maxSize));
    }
    function drawMouths(faceRect, faceHRect, mouthsRectV){
        // draw mouths
        for (var i = 0; i < mouthsRectV.size(); ++i) {
            var mouthRect = mouthsRectV.get(i);
            var x = faceRect.x + faceHRect.x + mouthRect.x + mouthRect.width / 2;
            var y = faceRect.y + faceHRect.y + mouthRect.y;
            var point1 = new cv.Point(x, y);
            var point2 = new cv.Point(x, y + mouthRect.height);
            var a = (i == 0)? 255 : 100;
            cv.rectangle(dst, point1, point2, [255, 0, 255, a]);
        }
    }

    function stabilizeRect(rect, name, samples, parentRect){
        if (!name) throw "missing name";
        if (!samples) throw "missing sample limit";

        if (!stabilizeCache[name]){ 
            stabilizeCache[name] = [];
        }else if(stabilizeCache[name].length >= samples){
            stabilizeCache[name].shift();
        }
        if (rect){
            stabilizeCache[name].push(rect);
        }else{
            stabilizeCache[name].shift();
        }
        var points = stabilizeCache[name];
        if (points.length > 0){
            var sumX = 0;
            var sumY = 0;
            var sumW = 0;
            var sumH = 0;
            var count = 0;
            for (var i = 0; i < points.length; i++){
                sumX += points[i].x;
                sumY += points[i].y;
                sumW += points[i].width;
                sumH += points[i].height;
                ++count;
            }
            sumX /= count;
            sumY /= count;
            sumW /= count;
            sumH /= count;
            if (parentRect){
                // prevent out of bounds errors during roi by cropping region in
                if (sumX + sumW > parentRect.width){
                    sumW -= (sumX + sumW) - parentRect.width;
                }
                if (sumY + sumH > parentRect.height){
                    sumH -= (sumY + sumH) - parentRect.height;
                }
            }
        }else{
            return rect;
        }
        return new cv.Rect(sumX, sumY, sumW, sumH);
    }

    function persistRect(rect, name, samples, parentRect){
        //uses the stabilizeCache to prevent flickering, provides no smoothing.
        //unused, can swap stabilizeRect out for persistRect if desired.
        if (!name) throw "missing name";

        if (!stabilizeCache[name]){ 
            stabilizeCache[name] = [];
        }else if(stabilizeCache[name].length >= samples){
            stabilizeCache[name].pop();
        }
        if (rect){
            stabilizeCache[name].unshift(rect);
            return rect;
        }else{
            if (stabilizeCache[name][0]){
                return stabilizeCache[name][0];
            }else{
                return rect;
            }
        }
    }

    function stabilizeAndSet(rectV, name, index, samples, parentRect){
        if (!index) index = 0;
        var rect = rectV.get(index);
        rect = stabilizeRect(rect, name + index, samples, parentRect);
        if (rect) rectV.set(index, rect);
        return rect;
    }

    function flipRectV(inRectV, parentMat){
        for(var i = 0; i < inRectV.size(); i++)
        {
            var r = inRectV.get(i);
            r.x = parentMat.cols - r.x - r.width;
            inRectV.set(i, r);
        }
    }

    function rotateMat(src, dst, angle){
        if (angle == 0){
           src.copyTo(dst);
           return 
        }
        var ptCp = new cv.Point(src.cols*0.5, src.rows*0.5);
        var m = new cv.Mat(cv.getRotationMatrix2D(ptCp, angle, 1.0));
        cv.warpAffine(src, dst, m, src.size(), cv.INTER_CUBIC); // Nearest is too rough
        m.delete();
    }

    function parseHoughCircles(inMat){
        var circles = [];
        for (var i = 0; i < inMat.cols; ++i) {
            var x = inMat.data32F[i * 3];
            var y = inMat.data32F[i * 3 + 1];
            var radius = inMat.data32F[i * 3 + 2];
            var center = new cv.Point(x, y);
            circles.push({ radius: radius, center: center });
        }
        return circles;
    }

    function rectVToParsedCircles(inRectV){
        var circles = [];
        for (var i = 0; i < inRectV.size(); i++){
            var rect = inRectV.get(i);
            circles.push(rectToParsedCircle(rect));
        }
        return circles;
    }
    function rectToParsedCircle(inRect){
        var radius = inRect.width / 2;
        var x = inRect.x + inRect.width / 2;
        var y = inRect.y + inRect.height / 2;
        var center = new cv.Point(x, y);
        return { radius: radius, center: center };
    }

    function parseFacePositions(video, faceRect, faceRectR, faceRectL, faceRectLower, eyeRectL, eyeRectR, pupilR, pupilL, mouthRect){
        var output = {
            video: null,
            face: null,
            eyes: null,
            mouth: null
        };
        if (video){
            output.video = {};
            output.video.width = video.width;
            output.video.height = video.height;
        }
        if (faceRect){
            output.face = {};
            output.face.translate = findRelativeTranslation(video, findRectMiddle(faceRect), true);
            output.face.rotate = {};

            if (eyeRectR || eyeRectL){
                output.eyes = {};

                output.eyes.r = parseEye(faceRectR, eyeRectR, pupilR);
                output.eyes.l = parseEye(faceRectL, eyeRectL, pupilL);

                function parseEye(faceHRect, eyeRect, pupilPoint){
                    var eyeOut = null;
                    if (eyeRect){
                        eyeOut = findRelativeTranslation(faceHRect, findRectMiddle(eyeRect));
                        if (pupilPoint){
                            eyeOut.pupil = findRelativeTranslation(eyeRect, pupilPoint.center);
                        }
                    }
                    return eyeOut;
                }

                if (eyeRectR && eyeRectL){
                    output.face.rotate.z = -findAngleBetween(findRectMiddle(eyeRectR), findRectMiddle(eyeRectL));
                }
            }
            if (mouthRect){
                output.mouth = findRelativeTranslation(faceRectLower, findRectMiddle(mouthRect));

                output.face.rotate.y = findAngleBetween({ x: 0, y: -faceRectLower.height / 2 }, multiplyRect(output.mouth, 4), -TAU / 4);
                output.face.rotate.x = -findAngleBetween({ x: -faceRectLower.width / 2, y: 0 }, multiplyRect(output.mouth, 4), TAU / 2 + TAU / 10);
            }
        }
        return output;
    }

    function findRectMiddle(rect){
        return {
            x: rect.x + rect.width / 2,
            y: rect.y + rect.height / 2,
            width: rect.width,
            height: rect.height,
        }
        
    }
    function findRelativeTranslation(parentRect, childRect, enableZ){
        var outRect = {}
        outRect.x = mapScale(childRect.x, 0, parentRect.width, -parentRect.width / 2, parentRect.width / 2);
        outRect.y = mapScale(childRect.y, 0, parentRect.height, -parentRect.height / 2, parentRect.height / 2);
        if (enableZ){
            //rough approximation, work in progress
            outRect.z = mapScale((parentRect.width - childRect.width), parentRect.width, 0, -parentRect.width / 2, parentRect.width / 2);
        }
        return outRect;
    }
    function mapScale(num, in_min, in_max, out_min, out_max){
        return (num - in_min) * (out_max - out_min) / (in_max - in_min) + out_min;
    }

    function findAngleBetween(pointA, pointB, offset){
        offset = (offset)? offset : 0;
        //radians, d = (r * 180 / Math.PI)
        return (Math.atan2(pointA.y - pointB.y, pointA.x - pointB.x) - offset);
    }

    function multiplyRect(rect, factor){
        var out = {};
        out.x = rect.x * factor;
        out.y = rect.y * factor;
        return out;
    }

    function sendFaceRigData(faceRigData){
        bc.postMessage(faceRigData);
    }

    function drawFps(){
        fpsEl.textContent = (fpsMeasure.fps.toFixed(1) + "fps");
    }

    function cleanup(){
        // OpenCV js requires manual garbage collection
        var itemsDeleted = 0;
        for (item of garbage){
            if (item && item.delete){
                item.delete();
                itemsDeleted++;
            }
        }
        console.log(`deleted ${itemsDeleted} items`);
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

    // init
    Promise.all(cascadeLoads).then(()=> {
        initCam().then((videoStream) => {
            stream = videoStream;
            initVideoMats();
            fpsMeasure = utils.initFPSMeasure(fpsEl);
            // schedule the first one.
            cv_running = true;
            requestAnimationFrame(processVideo);
        })
    });
}

loadOpenCV().then(main);
