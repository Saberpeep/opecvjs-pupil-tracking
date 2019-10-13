function loadOpenCV() {
    return new Promise((resolve, reject)=> {
        console.log('worker:',"loading OpenCV...");
        importScripts('opencv.js');
        //wait for opencv to trigger loaded hook
        cv['onRuntimeInitialized'] = () => {
            console.log('worker:',"loaded OpenCV!")
            resolve();
        };
    })
}

importScripts('utils.js');

loadOpenCV().then(main);

function main(){
    var src = null;
    var dst = null;
    var video = null;
    var gray = new cv.Mat();
    var cap = null;
    var faceClassifier = new cv.CascadeClassifier();
    var faces = new cv.RectVector();
    var face = new cv.Mat();
    var faceL = new cv.Mat();
    var faceR = new cv.Mat();
    var eyeClassifier = new cv.CascadeClassifier();
    var eyesL = new cv.RectVector();
    var eyesR = new cv.RectVector();
    var eye = new cv.Mat();
    var pupils = new cv.Mat();
    var candidate = new cv.Mat();
    var contours = new cv.MatVector();
    var hierarchy = new cv.Mat();
    var stabilizeCache = {};
    var noseClassifier = new cv.CascadeClassifier();
    var noses = new cv.RectVector();
    var nose = new cv.Mat();

    var utils = new Utils();

    onmessage = function (e) {
        var msg = e.data;
        console.log('worker:','Message received from main script', msg);
        if (msg.command){
            if (msg.command == 'nextFrame'){
                src = msg.src;
                if (!video) video = {};
                video.width = msg.width;
                video.height = msg.height;
                if (src){
                    processVideo();
                }
            }
        }
    }

    function loadCascadeFile(classifier,url){
        return new Promise((resolve, reject) => {
            // use createFileFromUrl to pre-load the xml
            utils.createFileFromUrl(url, url, () => {
                classifier.load(url); // in the callback, load the cascade from file 
                resolve();
            });
        });
    }

    // load pre-trained classifiers
    var cascadePromises = [];
    cascadePromises.push(loadCascadeFile(faceClassifier, '../haarcascades/haarcascade_frontalface_default.xml'));
    cascadePromises.push(loadCascadeFile(eyeClassifier, '../haarcascades/haarcascade_eye_tree_eyeglasses.xml'));
    cascadePromises.push(loadCascadeFile(noseClassifier, '../haarcascades/haarcascade_nose_simplecv.xml'));
    Promise.all(cascadePromises).then(()=>{
        postMessage({ command: 'initDone' });
    })

    function processVideo() {
        // start processing.
        src.copyTo(dst);
        cv.cvtColor(dst, gray, cv.COLOR_RGBA2GRAY, 0);
        
        detectFaces(gray, faces);
        if (faces.size()){
            var faceRect = faces.get(0);
            faceRect = stabilizeRect(faceRect, "face0", 5);
            faces.set(0, faceRect);
            drawFaces(faces);
            face = gray.roi(faceRect);
            var faceRectL = new cv.Rect(0, 0, faceRect.width / 2, faceRect.height);
            var faceRectR = new cv.Rect(faceRect.width / 2, 0, faceRect.width / 2, faceRect.height);
            faceL = face.roi(faceRectL);
            faceR = face.roi(faceRectR);
            detectEyes(faceL, eyesL);
            detectEyes(faceR, eyesR);
            if(eyesL.size()){
                var eyeRect = eyesL.get(0);
                eyeRect = stabilizeRect(eyeRect, "eyeL0", 5);
                eyesL.set(0, eyeRect);
                drawEyes(faceRect, faceRectL, eyesL);
                try{
                    eye = faceL.roi(eyeRect);
                }catch(e){
                    console.error("mysterious harmless error", e);
                }finally{
                    detectPupilsHough(eye, pupils);
                    var parsedPupils = parseHoughCircles(pupils);
                    drawPupils(faceRect, faceRectL, eyeRect, parsedPupils);
                }
            }
            if(eyesR.size()){
                var eyeRect = eyesR.get(0);
                eyeRect = stabilizeRect(eyeRect, "eyeR0", 5);
                eyesR.set(0, eyeRect);
                drawEyes(faceRect, faceRectR, eyesR);
                eye = faceR.roi(eyeRect);
                detectPupilsHough(eye, pupils);
                var parsedPupils = parseHoughCircles(pupils);
                drawPupils(faceRect, faceRectR, eyeRect, parsedPupils);
            }
            detectNoses(face, noses);
            if (noses.size()){
                var noseRect = noses.get(0);
                noseRect = stabilizeRect(noseRect, "nose0", 5);
                noses.set(0, noseRect);
                drawNoses(faceRect, noses);
            }
            

        }
        // output to canvas
        postMessage({ command: 'lastFrame', dst: dst });
    };

    function detectFaces(inMat, outRectV){
        // detect faces.
        if (!inMat) throw "missing Mat";
        if (!outRectV) throw "missing output";
        //(inputImage, foundObjects, scaleFactor, minNumNeigbors(aka threshhold), flags, minSize(of object), maxSize(of object))
        faceClassifier.detectMultiScale(gray, outRectV, 1.1, 5, 0, new cv.Size(video.width / 3));
    }
    function drawFaces(facesRectV){
        // draw faces.
        for (var i = 0; i < facesRectV.size(); ++i) {
            var faceRect = facesRectV.get(i);
            //faceRect = stabilizeRect(faceRect, "face" + i, 5);
            var point1 = new cv.Point(faceRect.x, faceRect.y);
            var point2 = new cv.Point(faceRect.x + faceRect.width, faceRect.y + faceRect.height);
            //var color = (i == 0)? [255, 0, 0, 255] : [100, 100, 100, 255]
            cv.rectangle(dst, point1, point2, [255, 0, 0, 255]);
        }
    }
    function detectEyes(faceHMat, outRectV){
        // detect eyes
        if (!faceHMat) throw "missing Mat";
        if (!outRectV) throw "missing output";
        var eyeMinSize = faceHMat.cols / 5;
        var eyeMaxSize = faceHMat.cols / 2;
        eyeClassifier.detectMultiScale(faceHMat, outRectV, 1.1, 2, 0, new cv.Size(eyeMinSize, eyeMinSize), new cv.Size(eyeMaxSize, eyeMaxSize));
        
    }
    function drawEyes(faceRect, faceHRect, eyesRectV){
        // draw eyes.
        for (var i = 0; i < eyesRectV.size(); ++i) {
            var eyeRect = eyesRectV.get(i);
            //eyeRect = stabilizeRect(eyeRect, stabilizeId + i, 5);
            var x = faceRect.x + faceHRect.x + eyeRect.x;
            var y = faceRect.y + eyeRect.y;
            var point1 = new cv.Point(x, y);
            var point2 = new cv.Point(x + eyeRect.width, y + eyeRect.height);
            cv.rectangle(dst, point1, point2, [0, 0, 255, 255]);
        }
    }
    function detectPupilsHough(eyeMat, outMat){
        // detect pupils using circle finding
        if (!eyeMat) throw "missing Mat";
        var pupilMinSize = eyeMat.cols / 10;
        var pupilMaxSize = eyeMat.cols / 3;
        cv.threshold(eyeMat, candidate, 70, 255, cv.THRESH_BINARY);
        var ksize = new cv.Size(13, 13);
        cv.GaussianBlur(candidate, candidate, ksize, 0, 0, cv.BORDER_DEFAULT);
        //cv.threshold(candidate, candidate, 70, 255, cv.THRESH_BINARY);
        cv.HoughCircles(candidate, outMat, cv.HOUGH_GRADIENT, 1, eyeMat.cols / 8, 250, 15, pupilMinSize, pupilMaxSize);
    }
    function drawPupils(faceRect, faceHRect, eyeRect, pupilsArr){
        for (var i = 0; i < pupilsArr.length; ++i) {
            var pupil = pupilsArr[i];
            var x = pupil.center.x + faceRect.x + faceHRect.x + eyeRect.x;
            var y = pupil.center.y + faceRect.y + faceHRect.y + eyeRect.y;
            var adjCenter = new cv.Point(x, y);
            cv.circle(dst, adjCenter, pupil.radius, [0, 255, 0, 255]);
        }
    }
    //UNUSED
    function detectPupils(mat, eyeRect){
        //detect pupils using contours
        if (!eyeRect) throw "missing Rect";
        if (!mat) throw "missing Mat";
        for (var threshold = 0; threshold <= 255; threshold++) {
            // Convert to binary image by thresholding it
            //cv.threshold(mat, candidate, threshold, 255, cv.THRESH_BINARY);
            cv.threshold(mat, candidate, 70, 255, cv.THRESH_BINARY);
            cv.findContours(candidate, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_NONE);
            var color = new cv.Scalar(0,255,0);
            cv.drawContours(dst, contours, 0, color, 1, cv.LINE_8, hierarchy, 0);
            for (var i = 0; i < contours.size(); i++) {
                var area = cv.contourArea(contours.get(i));
                var rect = cv.boundingRect(contours.get(i));
                var radius = rect.width / 2;
    
                var sizeRate = rect.width / eye.cols;
    
                // If contour: has round shape and has a specific size relation
                // Then it is the pupil
                if (sizeRate >= 0.01 && sizeRate <= 0.41 &&
                    Math.abs(1 - (rect.width / rect.height)) <= 0.2 &&
                    Math.abs(1 - (area / (Math.PI * Math.pow(radius, 2)))) <= 0.2)
                {
                    // draw
                    var x = eyeRect.x + rect.x;
                    var y = eyeRect.y + rect.y;
                    var point1 = new cv.Point(x, y);
                    var point2 = new cv.Point(x + rect.width, y + rect.height);
                    cv.rectangle(dst, point1, point2, [0, 255, 0, 255]);
                }
            }
        }
    }
    function detectNoses(faceMat, outRectV){
        // detect eyes
        if (!faceMat) throw "missing Mat";
        if (!outRectV) throw "missing output";
        var minSize = faceMat.cols / 10;
        var maxSize = faceMat.cols / 3;
        noseClassifier.detectMultiScale(faceMat, outRectV, 1.1, 2, 0, new cv.Size(minSize, minSize), new cv.Size(maxSize, maxSize));
    }
    function drawNoses(faceRect, nosesRectV){
        // draw noses
        for (var i = 0; i < nosesRectV.size(); ++i) {
            var noseRect = nosesRectV.get(i);
            var x = faceRect.x + noseRect.x + noseRect.width / 2;
            var y = faceRect.y + noseRect.y;
            var point1 = new cv.Point(x, y);
            var point2 = new cv.Point(x, y + noseRect.height);
            var a = (i == 0)? 255 : 100;
            cv.rectangle(dst, point1, point2, [255, 0, 255, a]);
        }
    }

    function estimateHeadPose(){
        
    }

    function stabilizeRect(rect, name, samples){
        if (!name) throw "missing name";
        if (!samples) throw "missing sample limit";

        if (!stabilizeCache[name]){ 
            stabilizeCache[name] = [];
        }else if(stabilizeCache[name].length >= samples){
            stabilizeCache[name].shift();
        }
        if (rect){
            stabilizeCache[name].push(rect);
        }
        var points = stabilizeCache[name];
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
        if (points.length > 0){
            sumX /= count;
            sumY /= count;
            sumW /= count;
            sumH /= count;
        }else{
            console.log('worker:',rect);
            return rect;
        }
        return new cv.Rect(sumX, sumY, sumW, sumH);
    }

    function parseHoughCircles(inMat){
        var circles = [];
        for (var i = 0; i < inMat.cols; ++i) {
            var x = inMat.data32F[i * 3];
            var y = inMat.data32F[i * 3 + 1];
            var radius = inMat.data32F[i * 3 + 2];
            var center = new cv.Point(x, y);
            //cv.circle(dst, center, radius, [0, 255, 0, 255]);
            circles.push({ radius: radius, center: center });
        }
        return circles;
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
    // window.addEventListener('beforeunload', () => {
    //     killCV();
    // })
    // window.killCV = function(){
    //     stream.getTracks()[0].stop();
    //     canvasOutput.getContext('2d').clearRect(0, 0, canvasOutput.width, canvasOutput.height);
    //     canvasDebug.getContext('2d').clearRect(0, 0, canvasDebug.width, canvasDebug.height);
    //     cv_running = false;
    //     cleanup();
    // }
}
