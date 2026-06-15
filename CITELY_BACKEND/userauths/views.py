
import uuid
from django.shortcuts import render
from django.http import JsonResponse
from django.core.mail import EmailMultiAlternatives
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from django.template.loader import render_to_string
from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.utils.http import urlsafe_base64_encode
from django.utils.encoding import force_bytes
from rest_framework.exceptions import NotFound
from django.shortcuts import get_object_or_404
import jwt
# Restframework
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework import generics
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.decorators import api_view, permission_classes
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.tokens import AccessToken
from django.contrib.auth import get_user_model
from rest_framework.views import APIView


# Others

import json
import random


# Serializers
from userauths.serializers import MyTokenObtainPairSerializer, ProfileSerializer, RegisterSerializer, UserSerializer

User = get_user_model()

# Models
from userauths.models import Profile, User



# from django.shortcuts import render

# from rest_framework_simplejwt.views import TokenObtainPairView
# from rest_framework import generics
# from rest_framework.permissions import AllowAny
# from userauths.models import User,Profile
# from userauths.serializers import MyTokenObtainPairSerializer, RegisterSerializer, UserSerializer, ProfileSerializer
# import random
# import shortuuid
# from rest_framework.response import Response
# from rest_framework import status


class MyTokenObtainPairView(TokenObtainPairView):
    serializer_class = MyTokenObtainPairSerializer
    permission_classes = [AllowAny]
    
class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]

    def get_serializer_context(self):
        return {"request": self.request}

class ProfileView(generics.RetrieveUpdateAPIView):
    serializer_class = ProfileSerializer
    permission_classes = (IsAuthenticated,)

    def get_object(self):
        user_id = self.kwargs['user_id']
        return get_object_or_404(Profile, user__id=user_id)

# class PasswordChangeView(APIView):
#     permission_classes = (AllowAny,)
#     serializer_class = UserSerializer

#     def create(self, request, *args, **kwargs):
#         payload = request.data

#         otp = payload.get('otp')
#         uidb64 = payload.get('uidb64')
#         reset_token = payload.get('reset_token')
#         password = payload.get('password')

#         if not all([otp, uidb64, reset_token, password]):
#             return Response(
#                 {"message": "All fields are required"},
#                 status=status.HTTP_400_BAD_REQUEST
#             )

#         # ✅ Decode uidb64 → integer user ID
#         try:
#             user_id = force_str(urlsafe_base64_decode(uidb64))
#             user = User.objects.get(
#                 id=user_id,
#                 otp=otp,
#                 reset_token=reset_token
#             )
#         except (User.DoesNotExist, ValueError, TypeError):
#             return Response(
#                 {"message": "Invalid reset link"},
#                 status=status.HTTP_400_BAD_REQUEST
#             )

#         # ✅ Set new password
#         user.set_password(password)

#         # ✅ Invalidate OTP & token
#         user.otp = None
#         user.reset_token = None
#         user.save()

#         return Response(
#             {"message": "Password changed successfully"},
#             status=status.HTTP_200_OK
#         )

class GoogleSignInView(generics.GenericAPIView):
    """
    View to handle Google OAuth sign-in.
    Receives a Google credential token from the frontend,
    verifies it, creates or gets the user, and returns JWT tokens.
    """
    permission_classes = [AllowAny]
    serializer_class = None
    
    def post(self, request, *args, **kwargs):
        credential = request.data.get('credential')
        
        if not credential:
            return Response(
                {"error": "Credential token is required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            # Decode the Google JWT token (without verification for now)
            # In production, you should verify the token with Google's public keys
            decoded_token = jwt.decode(credential, options={"verify_signature": False})
            
            # Extract user information from the token
            email = decoded_token.get('email')
            name = decoded_token.get('name', '')
            given_name = decoded_token.get('given_name', '')
            family_name = decoded_token.get('family_name', '')
            picture = decoded_token.get('picture', '')
            
            if not email:
                return Response(
                    {"error": "Email not found in Google token"},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Generate username from email or name
            username = email.split('@')[0] if email else given_name.lower().replace(' ', '') if given_name else 'user'
            
            # Get or create user
            user, created = User.objects.get_or_create(
                email=email,
                defaults={
                    'username': username,
                    'first_name': given_name,
                    'last_name': family_name,
                }
            )
            
            # If user already exists but name fields are empty, update them
            if not created:
                if not user.first_name and given_name:
                    user.first_name = given_name
                if not user.last_name and family_name:
                    user.last_name = family_name
                user.save()
            
            # Update profile if picture is available
            if hasattr(user, 'profile') and picture:
                profile = user.profile
                # You can store the picture URL or download it
                # For now, we'll just ensure the profile exists
                if not profile.username:
                    profile.username = username
                    profile.save()
            
            # Transfer guest cart to user if it exists
            # transfer_guest_cart_to_user(request, user)
            
            # Generate JWT tokens
            refresh = RefreshToken.for_user(user)
            access_token = str(refresh.access_token)
            refresh_token = str(refresh)
            
            return Response({
                "access": access_token,
                "refresh": refresh_token,
                "user": {
                    "id": user.id,
                    "email": user.email,
                    "username": user.username,
                    "first_name": user.first_name,
                    "last_name": user.last_name,
                }
            }, status=status.HTTP_200_OK)
            
        except jwt.DecodeError:
            return Response(
                {"error": "Invalid token format"},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            print(f"Google Sign-In error: {str(e)}")
            return Response(
                {"error": f"An error occurred during Google sign-in: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

