import sys
import camera
from PyQt5.QtGui import *
from PyQt5.QtWidgets import *
from PyQt5.QtCore import *




class Overview(QWidget):
    def __init__(self):
        super().__init__()
        
        self.main = QVBoxLayout() 

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

        self.main.addLayout(self.row1)
        self.main.addLayout(self.row2)


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
        
        self.main.addLayout(self.timeline)

        self.CancelBTN = QPushButton("Cancel")
        self.CancelBTN.clicked.connect(self.cancelFeed)

        self.connectCamera()



    
        # self.setLayout(self.main)

    def getLayout(self):
        return self.main
    
    def connectCamera(self):
        self.Camera1 = camera.Camera("1")
        self.Camera2 = camera.Camera("2")
        self.Camera3 = camera.Camera("3")
        self.Camera4 = camera.Camera("4")
        self.Camera1.start()
        self.Camera2.start()
        self.Camera3.start()
        self.Camera4.start()

        self.Camera1.imageUpdate.connect(lambda image: self.imageUpdateSlot1(image, self.FeedLabel1))
        self.Camera2.imageUpdate.connect(lambda image: self.imageUpdateSlot1(image, self.FeedLabel2))
        self.Camera3.imageUpdate.connect(lambda image: self.imageUpdateSlot1(image, self.FeedLabel3))
        self.Camera4.imageUpdate.connect(lambda image: self.imageUpdateSlot1(image, self.FeedLabel4))

    def imageUpdateSlot1(self, image, feedLabel):
        feedLabel.setPixmap(QPixmap.fromImage(image))

    def cancelFeed(self):
        self.Camera1.stop()
        self.Camera2.stop()
        self.Camera3.stop()
        self.Camera4.stop()




if __name__ == "__main__":
    
    app = QApplication(sys.argv)
    widget = Overview()
    widget.show()


    sys.exit(app.exec())