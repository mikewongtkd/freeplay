from stages.main_page import Main_Page
from PyQt5.QtGui import *
from PyQt5.QtWidgets import *
from PyQt5.QtCore import *


class SingleCamView(Main_Page):
    def __init__(self, controller, camera):
        super().__init__() #call Main_page and overlay camera stuff on it
        self.single_page = self.camera_setup(camera)
        self.setup_page(self.single_page, controller)

    def camera_setup(self, camera): #camera setup
        self.page = QVBoxLayout() 
        self.cameraWidget = camera #this doesn't work
        self.page.addWidget(self.cameraWidget)



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

        return self.page
    
    # def addCamera(self, cameraSlot):
    #     # connection.updateSlot(cam_num, self.cameraWidget)
    #     self.cameraWidget = cameraSlot