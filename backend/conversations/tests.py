import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from conversations.models import Channel
from conversations.serializers import ChannelSerializer, SECRET_FIELDS


@pytest.fixture
def api_client(db):
    user = User.objects.create_user(username='testuser', password='testpass')
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def whatsapp_channel(db):
    return Channel.objects.create(
        name='WA Test',
        type='whatsapp',
        is_active=True,
        credentials={
            'phone_number_id': '111',
            'access_token': 'real_token',
            'app_secret': 'real_secret',
            'verify_token': 'my_verify',
        },
    )


# ── ChannelSerializer secret masking ─────────────────────────────

@pytest.mark.django_db
class TestChannelSerializerMasking:
    def test_secrets_are_masked_on_read(self, whatsapp_channel):
        data = ChannelSerializer(whatsapp_channel).data
        creds = data['credentials']
        for field in SECRET_FIELDS:
            if field in creds:
                assert creds[field] == '••••••••', f"{field} should be masked"

    def test_non_secret_fields_are_not_masked(self, whatsapp_channel):
        data = ChannelSerializer(whatsapp_channel).data
        assert data['credentials']['phone_number_id'] == '111'

    def test_blank_secret_preserves_existing_on_update(self, whatsapp_channel):
        serializer = ChannelSerializer(
            whatsapp_channel,
            data={'name': 'WA Test', 'type': 'whatsapp', 'credentials': {'access_token': ''}},
            partial=True,
        )
        assert serializer.is_valid(), serializer.errors
        updated = serializer.save()
        assert updated.credentials['access_token'] == 'real_token'

    def test_new_secret_value_overwrites(self, whatsapp_channel):
        serializer = ChannelSerializer(
            whatsapp_channel,
            data={'name': 'WA Test', 'type': 'whatsapp', 'credentials': {'access_token': 'new_token'}},
            partial=True,
        )
        assert serializer.is_valid(), serializer.errors
        updated = serializer.save()
        assert updated.credentials['access_token'] == 'new_token'


# ── Channel API endpoints ─────────────────────────────────────────

@pytest.mark.django_db
class TestChannelViewSet:
    def test_list_channels_requires_auth(self):
        client = APIClient()
        response = client.get('/api/conversations/channels/')
        assert response.status_code == 401

    def test_list_channels_authenticated(self, api_client, whatsapp_channel):
        response = api_client.get('/api/conversations/channels/')
        assert response.status_code == 200

    def test_create_channel(self, api_client):
        response = api_client.post('/api/conversations/channels/', {
            'name': 'New WA',
            'type': 'whatsapp',
            'credentials': {'phone_number_id': '999', 'access_token': 'tok'},
        }, format='json')
        assert response.status_code == 201
        assert response.data['name'] == 'New WA'

    def test_update_channel_preserves_secret(self, api_client, whatsapp_channel):
        response = api_client.patch(
            f'/api/conversations/channels/{whatsapp_channel.id}/',
            {'credentials': {'access_token': ''}},
            format='json',
        )
        assert response.status_code == 200
        whatsapp_channel.refresh_from_db()
        assert whatsapp_channel.credentials['access_token'] == 'real_token'
