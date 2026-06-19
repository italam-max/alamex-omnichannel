from rest_framework.routers import DefaultRouter
from .views import ChannelViewSet, ContactViewSet, ConversationViewSet, MessageViewSet

router = DefaultRouter()
router.register('channels', ChannelViewSet)
router.register('contacts', ContactViewSet)
router.register('messages', MessageViewSet)
router.register('', ConversationViewSet)

urlpatterns = router.urls
