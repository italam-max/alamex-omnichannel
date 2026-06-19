from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from .models import Channel, Contact, Conversation, Message
from .serializers import ChannelSerializer, ContactSerializer, ConversationSerializer, MessageSerializer


class ChannelViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Channel.objects.all()
    serializer_class = ChannelSerializer
    permission_classes = [IsAuthenticated]


class ContactViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Contact.objects.select_related('channel').all()
    serializer_class = ContactSerializer
    permission_classes = [IsAuthenticated]


class ConversationViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Conversation.objects.select_related('channel', 'contact').prefetch_related('messages').all()
    serializer_class = ConversationSerializer
    permission_classes = [IsAuthenticated]


class MessageViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Message.objects.select_related('conversation').all()
    serializer_class = MessageSerializer
    permission_classes = [IsAuthenticated]
