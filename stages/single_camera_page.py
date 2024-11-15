from stages.main_page import Main_Page
from PyQt5.QtGui import *
from PyQt5.QtWidgets import *
from PyQt5.QtCore import *

#single cam view needs to keep track of old cam it connected to and disconnect from it when its switching back to overview

class SingleCamView(Main_Page):
    def __init__(self, connection, controller):
        super().__init__() #call Main_page and overlay camera stuff on it
        self.single_page = None
        self.setup_page(self.single_page, controller)
        self.connection = connection
        self.old_connected_cam = 0 #must keep track of old connected camera and disconnect
        # self.curr_connected_cam = 0

    def camera_setup(self, cam_num): #camera setup
        self.page = QVBoxLayout() 
        self.cameraWidget = QLabel() #this doesn't work

        self.connect_cam(cam_num)
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

    def connect_cam(self, cam_num): #connect to the qlabel for single-page #i dont know why this doesnt work anymore :(
        # if self.old_connected_cam in {1,2,3,4}:
        #     self.connection.disconnectSlot(cam_num) #disconnect before adding another camera
        # self.cameraWidget = QLabel() #this doesn't work
        self.connection.updateSlot(cam_num, self.cameraWidget)
        self.old_connected_cam = cam_num
    
    def disconnect_cam(self, cam_num): #disconnect so that going back to overview or setup will not finnick
        self.connection.disconnectSlot(cam_num)
