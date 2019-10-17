# OpenCV.js Simple Face Detection with Pupil Tracking

1. [eye tracker](https://saberpeep.github.io/opecvjs-pupil-tracking/eye-tracker.html)
2. [face demo](https://saberpeep.github.io/opecvjs-pupil-tracking/face-rig.html) (open in new window while eye tracker is running)

This simple demo uses haarcascades and contour circle detection to detect basic facial landmarks and most importantly, pupil positions.
The javascript port of OpenCV does not appear to support 3D operations, so true head pose estimation is not available.
This attempts to estimate some pose data using 2D coordinates of a few facial landmarks, to varying degrees of success.

## Running the Demo

To run the online demo, plug in a webcam and open the eye tracker page in one window, with the face demo open in another window.
They both must be visible for it to be run, this is a limitation of requestAnimationFrame, and the use of two separate files.
The eye tracker can take up to 10 seconds to load, the WebAssembly OpenCV is a very large library, see the console for status.

To run this locally, a simple nodejs server has been provided. `cd` in and run `npm install` and then `npm start`, the pages will be served at `localhost:80`.

## Other Notes

This is by no means a professional nor perfect example, and has been created for my own learning experience, and should be regarded as such.
However I hope this can help others who are looking into a super simple pupil tracking solution.

Despite my best efforts, it leaks memory, especially on reload. Though I believe at least some of this is an inherent issue with OpenCV.js

Most of the haarcascades are from the official OpenCV repo, See individual haarcascade files for specific license information.