from stages.main_page import Main_Page
from PyQt5.QtGui import *
from PyQt5.QtWidgets import *
from PyQt5.QtCore import *


class Overview(Main_Page):
    def __init__(self, cameras):
        super().__init__() #call Main_page and overlay camera stuff on it
        self.overview = self.camera_setup(cameras)
        self.setup_page(self.overview)
        


    def camera_setup(self, cameras): #camera setup
        self.page = QVBoxLayout() 

        #camera 1 and 2
        self.row1 = QHBoxLayout()
        self.FeedLabel1 = QLabel()
        self.FeedLabel2 = QLabel()
        self.row1.addWidget(self.FeedLabel1)
        self.row1.addWidget(self.FeedLabel2)

        #camera 3 and 4
        self.row2 = QHBoxLayout()
        self.FeedLabel3 = QLabel()
        self.FeedLabel4 = QLabel()
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


    
    # def return_to_setup(self):
    #     self.start_signal.emit()


            #TO BE PUT SOMEWHERE ELSE
        # self.CancelBTN = QPushButton("Cancel")
        # self.CancelBTN.clicked.connect(cameras.cancelFeed)