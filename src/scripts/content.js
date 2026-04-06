(function(){
    //this controls the position and size of the image, overlay image will be the image on screen
    let config = { visible: false, posX: 85, posY: 80, size: 120 };
    let overlayImage = null;

    console.log("Fram: Fram content script loaded", config);

    //store originam getUserMedia before replacing it with a hook
    const originalGUM = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    //Hook function to replace the originalGUM with our own version
    navigator.mediaDevices.getUserMedia = async(constraints) => {
        console.log("Hook loaded", constraints);
        const stream = await originalGUM(constraints);

        //early returns if there is no camera or browser does not support our extension
        if (!constraints || !constraints.video) 
            return stream;

        const videoTrack = stream.getVideoTracks()[0];

        if(!videoTrack)
                return stream;
        
        if (typeof MediaStreamTrackProcessor === "undefined" || typeof MediaStreamTrackGenerator === "undefined") {
            return stream;
        }

        const processor =  new MediaStreamTrackProcessor({ track: videoTrack });
        const generator = new MediaStreamTrackGenerator({ kind: "video" });

        const canvas = new OffscreenCanvas(1, 1);
        const ctx = canvas.getContext("2d");

        const transformer = new TransformStream({
            async transform(frame, controller){
                const w = frame.displayWidth;
                const h = frame.displayHeight;

                if (canvas.width !== w || canvas.height !== h){
                    canvas.width = w;
                    canvas.height = h;
                }
            }
        })



    return stream;
    };

    function compositeOverlay(ctx, width, height){
        if(config.visible === false || overlayImage === null)
            return;
        const pixelPosX = ((config.posX / 100) * width) - (config.size / 2);
        const pixelPosY = ((config.posY / 100) * height) - (config.size / 2);
        
        ctx.drawImage(overlayImage, pixelPosX, pixelPosY, config.size, config.size);
    }
    
})();