from PyQt5.QtCore import QObject, pyqtSignal

class PageController(QObject):
    show_setup = pyqtSignal()  # Signal for showing main page
    show_overview = pyqtSignal()  # Signal for showing settings page
    stop = pyqtSignal()

    show_cam1 = pyqtSignal()
    show_cam2 = pyqtSignal()
    show_cam3 = pyqtSignal()
    show_cam4 = pyqtSignal()

    def __init__(self):
        super().__init__()