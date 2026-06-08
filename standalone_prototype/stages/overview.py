from stages.main_page import Main_Page
from PyQt5.QtGui import *
from PyQt5.QtWidgets import *
from PyQt5.QtCore import *

class ClickableLabel(QLabel):
    clicked = pyqtSignal()
    def __init__(self):
        super().__init__()
    def mousePressEvent(self, event):
        # signals = {1: controller.cam1, 2: controller.cam2, 3: controller.cam3, 4: controller.cam4}
        if event.button() == Qt.LeftButton:  # Check if left button was clicked
            self.clicked.emit()  # Emit the signal
        super().mousePressEvent(event)

class Overview(Main_Page):
    def __init__(self, cameras, controller):
        super().__init__() #call Main_page and overlay camera stuff on it
        self.cameras = cameras
        self.overview = self.camera_setup(self.cameras, controller)
        self.setup_page(self.overview, controller)
        


    def camera_setup(self, cameras, controller): #camera setup
        self.page = QVBoxLayout() 

        #camera 1 and 2
        self.row1 = QHBoxLayout()
        self.FeedLabel1 = ClickableLabel()
        self.FeedLabel1.clicked.connect(controller.show_cam1.emit)
        self.FeedLabel2 = ClickableLabel()
        self.FeedLabel2.clicked.connect(controller.show_cam2.emit)
        self.row1.addWidget(self.FeedLabel1)
        self.row1.addWidget(self.FeedLabel2)

        #camera 3 and 4
        self.row2 = QHBoxLayout()
        self.FeedLabel3 = ClickableLabel()
        # Connect the clicked signal to a slot
        self.FeedLabel3.clicked.connect(controller.show_cam3.emit)
        self.FeedLabel4 = ClickableLabel()
        self.FeedLabel4.clicked.connect(controller.show_cam4.emit)
        self.row2.addWidget(self.FeedLabel3)
        self.row2.addWidget(self.FeedLabel4)

        self.page.addLayout(self.row1)
        self.page.addLayout(self.row2)


        #timeline slot
        self.timeline = QHBoxLayout()
        self.minBTN = QPushButton("-")
        
        self.timelineSearch = QPushButton("")
        self.timelineSearch.setIcon(QIcon('images/timelineSearchIcon.png'))

        self.replayHistory = QPushButton("timeline to be implemented") #filler for now QTimeline stuff

        self.maxBTN = QPushButton("+")

        
        self.timeline.addWidget(self.minBTN)
        self.timeline.addWidget(self.timelineSearch)
        self.timeline.addWidget(self.replayHistory)
        self.timeline.addWidget(self.maxBTN)
        
        self.page.addLayout(self.timeline)


        feedlabels = {1: self.FeedLabel1, 2: self.FeedLabel2, 3: self.FeedLabel3, 4: self.FeedLabel4}
        for i in range(1, 5):
            cameras.updateSlot(i, feedlabels[i])

        return self.page
    
    def getCameraSlot(self, cam_num): #this returns qlabel of a camera
        cameras = {1:self.FeedLabel1, 2: self.FeedLabel2, 3: self.FeedLabel3, 4: self.FeedLabel4}
        return cameras[cam_num]
    
    # def disconnectCameraSlot(self, cam_num): #disconnect the camera that is to be fed into single page
    #     self.cameras.disconnectSlot(cam_num)