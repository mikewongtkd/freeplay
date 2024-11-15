from camera import camera
from PyQt5.QtGui import *
from PyQt5.QtWidgets import *
from PyQt5.QtCore import *
class Connection():
    def __init__(self):
        self.startCamera()
        self.cameras = {1: self.Camera1, 2: self.Camera2, 3: self.Camera3, 4: self.Camera4}

    def startCamera(self):
        self.Camera1 = camera.Camera("1")
        self.Camera2 = camera.Camera("2")
        self.Camera3 = camera.Camera("3")
        self.Camera4 = camera.Camera("4")
        self.Camera1.start()
        self.Camera2.start()
        self.Camera3.start()
        self.Camera4.start()

    def imageUpdateSlot1(self, image, feedLabel):
        feedLabel.setPixmap(QPixmap.fromImage(image))

    def cancelFeed(self): #disconnect then stop
        self.Camera1.imageUpdate.disconnect()
        self.Camera2.imageUpdate.disconnect()
        self.Camera3.imageUpdate.disconnect()
        self.Camera4.imageUpdate.disconnect()
        # cameras = [self.Camera1, self.Camera2, self.Camera3, self.Camera4]
        camera.Camera.stop(self.cameras.values())


    def getCameras(self):
        return [self.Camera1, self.Camera2, self.Camera3, self.Camera4]
    
    def getCamera(self, num):
        return self.cameras[num]
    
    def disconnectSlot(self, cam_num):
        if cam_num in self.cameras:
            self.cameras[cam_num].imageUpdate.disconnect()


    def updateSlot(self, camera_number, feedlabel):
        self.cameras[camera_number].imageUpdate.connect(lambda image: self.imageUpdateSlot1(image, feedlabel))

    # def switch_camera(self, old_camera_number, new_camera_number, feedlabel):
    #     # Step 1: Disconnect the old camera's signal from the feedLabel
    #     if old_camera_number in self.cameras:
    #         self.cameras[old_camera_number].imageUpdate.disconnect()

    #         # Optionally stop the old camera if needed
    #         self.cameras[old_camera_number].stop()

    #     # Step 2: Connect the new camera's signal to the feedLabel
    #     if new_camera_number in self.cameras:
    #         self.cameras[new_camera_number].imageUpdate.connect(lambda image: self.imageUpdateSlot1(image, feedlabel))
            
    #         # Optionally start the new camera if it was stopped
    #         self.cameras[new_camera_number].start()
