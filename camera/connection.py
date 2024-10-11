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

    def cancelFeed(self):
        self.Camera1.stop()
        self.Camera2.stop()
        self.Camera3.stop()
        self.Camera4.stop()


    def getCameras(self):
        return [self.Camera1, self.Camera2, self.Camera3, self.Camera4]
    
    def getCamera(self, num):
        return self.cameras[num]

    def updateSlot(self, camera_number, feedlabel):
        self.cameras[camera_number].imageUpdate.connect(lambda image: self.imageUpdateSlot1(image, feedlabel))
        # self.Camera2.imageUpdate.connect(lambda image: self.imageUpdateSlot1(image, self.FeedLabel2))
        # self.Camera3.imageUpdate.connect(lambda image: self.imageUpdateSlot1(image, self.FeedLabel3))
        # self.Camera4.imageUpdate.connect(lambda image: self.imageUpdateSlot1(image, self.FeedLabel4))

