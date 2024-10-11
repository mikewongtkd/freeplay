from PyQt5.QtCore import QObject, pyqtSignal

class PageController(QObject):
    show_setup = pyqtSignal()  # Signal for showing main page
    show_overview = pyqtSignal()  # Signal for showing settings page
    stop = pyqtSignal()

    cam1 = pyqtSignal()
    cam2 = pyqtSignal()
    cam3 = pyqtSignal()
    cam4 = pyqtSignal()

    def __init__(self):
        super().__init__()