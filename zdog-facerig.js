document.addEventListener('DOMContentLoaded', function(){
    var TAU = Zdog.TAU,
        canvas = document.querySelector('canvas.zdog');

    let illo = new Zdog.Illustration({
        element: 'canvas.zdog',
        dragRotate: true,
        // zoom: 0.8,
        // rotate: { x: -TAU / 16, y: -TAU / 8 },
    });
    var faceRig = new FaceRig({
        addTo: illo,
        // translate: { y: -100 },
    });
    var cvData= {};
    var smoothMovesCache = {};

    window.faceRig = faceRig;
    console.log("faceRig:", faceRig);

    canvas.addEventListener('wheel', function(e){
        e.preventDefault();
        var zoom = illo.zoom
        zoom -= e.deltaY / 1000;
        if (zoom < 0.1){
            zoom = 0.1;
        }
        illo.zoom = zoom;
    }, false);

    function FaceRig(options){

        var flipAxis = 'x';

        var yellow = '#ffca69',
            black = 'black',
            white = 'white',
            orange = '#ffa14f';
            
        this.anchor = new Zdog.Anchor(options);
        this.head = new Head({
            addTo: this.anchor,
        });
        this.eyeL = new Eye({
            addTo: this.head.anchor,
        }, 'L');
        this.eyeR = new Eye({
            addTo: this.head.anchor,
        }, 'R');
    
        function Head(options){
            this.anchor = new Zdog.Anchor(options);

            this.head = new Zdog.Shape({
                addTo: this.anchor,
                stroke: 120,
                path: [
                    { x: 0, y: 20, z: -1 },
                    { x: 0, y: 10, z: 0 },
                    { x: 0, y: 0, z: 0 },
                ],
                color: yellow,
            });
            this.faceAnchor = new Zdog.Anchor({
                addTo: this.anchor,
                translate: { x: 0, y: -10, z: 0 },
            });
            this.beak = new Zdog.Cone({
                addTo: this.faceAnchor,
                length: 20,
                diameter: 10,
                color: orange,
                stroke: 5,
                translate: { x: 0, y: 0, z: 55 },
                rotate: { x: TAU / 60 },
            });


        };//end head

        function Eye(options, side){
            this.anchor = new Zdog.Anchor(options);

            this.eyeGroup = new Zdog.Group({
                addTo: this.anchor,
                translate: { x: 35, y: -15, z: 50 },
                rotate: { y: -TAU / 36 },
            })

            this.eye = new Zdog.Ellipse({
                addTo: this.eyeGroup,
                width: 50,
                height: 50,
                stroke: 5,
                fill: true,
                color: white,
            });

            this.pupil = new Zdog.Shape({
                addTo: this.eyeGroup,
                stroke: 20,
                color: black,
                translate: { x: 0, y: 0, z: 0 },
            });
            this.eyeLines = new Zdog.Shape({
                addTo: this.anchor,
                stroke: 5,
                path: [
                    { x: 15, y: -1, z: 0 },
                    { x: -15, y: 0, z: 0 },
                    { x: 15, y: 7, z: 0 },
                ],
                closed: false,
                color: black,
                translate: { x: 35, y: -15, z: 50 },
                rotate: { y: -TAU / 12 },
                visible: false,
            });

            flipIfRight(this, side);
        }//end eye


        function flipShape(zdogShape, axis){
            //still kinda wonky, its doesnt like flipping the same shape (or a copy of that shape) twice, and I dont know why
            if (!axis) axis = flipAxis;
            axis = axis.toLowerCase();
            if (!zdogShape.addTo){ //if it doesn't have an addTo, we are assuming it's not a Zdog shape,
                zdogShape = zdogShape.anchor; //allows custom constructed objects to be flippable
            }
            if (!zdogShape) return undefined;
            if (zdogShape.path){
                for (var i = 0; i < zdogShape.path.length; i++){
                    if(zdogShape.path[i][axis]){
                        zdogShape.path[i][axis] = -zdogShape.path[i][axis];
                    }else
                    if (zdogShape.path[i].arc){
                        for (var j = 0; j < zdogShape.path[i].arc.length; j++){
                            zdogShape.path[i].arc[j][axis] = -zdogShape.path[i].arc[j][axis];
                        }
                    }else
                    if (zdogShape.path[i].bezier){
                        for (var j = 0; j < zdogShape.path[i].bezier.length; j++){
                            zdogShape.path[i].bezier[j][axis] = -zdogShape.path[i].bezier[j][axis];
                        }
                    }
                }

                zdogShape.updatePath();
            }
            if (zdogShape.translate && zdogShape.translate[axis]){
                zdogShape.translate[axis] = -zdogShape.translate[axis];
            }
            if (zdogShape.rotate){
                if (zdogShape.rotate.x && axis != 'x') zdogShape.rotate.x =  -zdogShape.rotate.x;
                if (zdogShape.rotate.y && axis != 'y') zdogShape.rotate.y =  -zdogShape.rotate.y;
                if (zdogShape.rotate.z && axis != 'z') zdogShape.rotate.z =  -zdogShape.rotate.z;
            }
            return zdogShape;
        }

        function flipAll(partObject){
            for (var key in partObject) {
                if (partObject.hasOwnProperty(key) && key != 'anchor') { //last bit prevents flipping of main anchor options
                    flipShape(partObject[key]);
                }
            }
        }

        function flipIfRight(partObject, side){
            if (side && side.toUpperCase() == 'R'){
                flipAll(partObject);
            }
        }

        function shadeAllByDepth(partObject, reverse){
            for (var key in partObject) {
                if (partObject.hasOwnProperty(key)) {
                    var thisPart = partObject[key];
                    if (thisPart.color && thisPart.color.shadeByDepth){
                        thisPart.color = thisPart.color.shadeByDepth(thisPart, reverse);
                    }else if(thisPart.anchor){
                        shadeAllByDepth(thisPart, reverse);
                    }
                }
            }
        }

        function toggleWireframeAll(partObject){
            partObject.wireframeEnabled = !partObject.wireframeEnabled;
            for (var key in partObject) {
                if (partObject.hasOwnProperty(key)) {
                    var thisPart = partObject[key];
                    if (typeof thisPart == 'object'){
                        if ('fill' in thisPart){ //`in` is used to check if a property is defined at all (regardless of truthiness in value).
                            //Parts are marked as ignored if they are already not filled, 
                            // and thus are skipped even in future toggles.
                            // This is to prevent accidentally filling parts on toggle back.
                            if(!('wireframeIgnore' in thisPart) && !thisPart.fill){
                                thisPart.wireframeIgnore = true;
                            }else if(thisPart.fill){
                                thisPart.wireframeIgnore = false;
                            }
                            if(!thisPart.wireframeIgnore){
                                thisPart.fill = !partObject.wireframeEnabled;
                            }
                        }else if(thisPart.anchor){
                            toggleWireframeAll(thisPart);
                        }
                    }
                }
            }
        }

        this.toggleWireframe = function(){
            toggleWireframeAll(this);
        }.bind(this);
    };

    var bc = new BroadcastChannel('faceRig');
    bc.addEventListener('message', function({data}){
        //console.log(data);
        cvData = data;
    })
    
    function animate() {

        if(cvData && cvData.video){
            if(cvData.face){
                // faceRig.head.anchor.translate = smoothMoves(faceRig.head.anchor.translate, cvData.face.translate, 'faceTrans', 100, 200);
                // faceRig.head.anchor.rotate = smoothMoves(faceRig.head.anchor.rotate, cvData.face.rotate, 'faceRot', TAU / 100, TAU);
                faceRig.head.anchor.translate = cvData.face.translate || faceRig.head.anchor.translate;
                if(cvData.face.rotate.y) faceRig.head.anchor.rotate.y = cvData.face.rotate.y;
                if(cvData.face.rotate.x) faceRig.head.anchor.rotate.x = cvData.face.rotate.x;
                if(cvData.face.rotate.z) faceRig.head.anchor.rotate.z = cvData.face.rotate.z;
            }
            if (cvData.eyes){
                if(cvData.eyes.l && cvData.eyes.l.pupil){
                    blink(faceRig.eyeL,false);
                    for (var axis in cvData.eyes.l.pupil){
                        faceRig.eyeL.pupil.translate[axis] = cvData.eyes.l.pupil[axis] * 4;
                    }
                }else{
                    blink(faceRig.eyeL,true);
                }
                if(cvData.eyes.r && cvData.eyes.r.pupil){
                    blink(faceRig.eyeR,false);
                    for (var axis in cvData.eyes.r.pupil){
                        faceRig.eyeR.pupil.translate[axis] = cvData.eyes.r.pupil[axis] * 4;
                    }
                }else{
                    blink(faceRig.eyeR,true);
                }
            }else{
                blink(faceRig.eyeR,true);
                blink(faceRig.eyeL,true);
            }
            
        }

        illo.updateRenderGraph();
        requestAnimationFrame(animate);
    }
    animate();

    function blink(zDogEyeObj, closed){
        zDogEyeObj.eyeGroup.visible = !closed;
        zDogEyeObj.eyeLines.visible = closed;
    }

    //work in progress
    function smoothMoves(currentPoint, targetPoint, name, baseSpeed, upperBound){
        var outPoint = {},
            target = {};

        if (!smoothMovesCache[name]) smoothMovesCache[name] = {};

        if (targetPoint){
            target = targetPoint;
            smoothMovesCache[name].lastTarget = targetPoint;
        }else{
            if (smoothMovesCache[name].lastTarget){
                target = smoothMovesCache[name].lastTarget;
            }else{
                return currentPoint;
            }
        }
                    
        //adjust incriment for smooth movement
        // essentially takes the input increment and scales it to the distance between the current point and the target.
        // so that the increment smoothly decreases as the current point gets nearer to its target.
        function parseAxis(axis){
            if (!currentPoint[axis]) currentPoint[axis] = 0;

            if (target.hasOwnProperty(axis)){
                if (!target[axis]) target[axis] = 0;
                var speed = Math.abs(mapScale(baseSpeed, 0, upperBound, 0, target[axis] - currentPoint[axis]));
                if (currentPoint[axis] < target[axis]){
                    outPoint[axis] = currentPoint[axis] + speed;
        
                }else if(currentPoint[axis] > target[axis]){
                    outPoint[axis] = currentPoint[axis] - speed;
                }else{
                    outPoint[axis] = currentPoint[axis];
                }
            }
        }
        parseAxis('x');
        parseAxis('y');
        parseAxis('z');

        if (!outPoint.x && !outPoint.y && !outPoint.z){
            console.log(currentPoint,targetPoint,target,outPoint);
        }

        return outPoint;
    }

    function mapScale(num, in_min, in_max, out_min, out_max){
        return (num - in_min) * (out_max - out_min) / (in_max - in_min) + out_min;
    }

});