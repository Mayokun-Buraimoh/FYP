from django.db import models
from django.contrib.auth.models import AbstractUser
from shortuuid.django_fields import ShortUUIDField

# Create your models here.

from django.db.models.signals import post_save

class User(AbstractUser):
    email = models.EmailField(unique=True)
    username = models.CharField(max_length=255)
    # is_email_verified = models.BooleanField(default=False)
    # otp = models.CharField(max_length=6, null=True, blank=True)
    # reset_token = models.TextField(blank=True, null=True)


    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username']
    
    def __str__(self):
        return self.email
    
class Profile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    username = models.CharField(max_length=255, null=True, blank=True)
    phone = models.CharField(max_length=20, null=True, blank=True)
    address = models.TextField(null=True, blank=True)
    phone = models.CharField(max_length=20, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    pid = ShortUUIDField(length=10, max_length=10, alphabet='abcdefghijklmnopqrstuvwxyz')
    
    def __str__(self):
        if self.username:
            return str(self.username)
        else:
            return str(self.user.username)
        
    def save(self, *args, **kwargs):
        if not self.username or self.username == "":
            self.username = self.user.username
        
        super(Profile, self).save(*args, **kwargs) 
    
    
def create_user_profile(sender, instance, created, *args, **kwargs):
    if created:
        Profile.objects.create(user=instance)
        
def save_user_profile(sender, instance, *args, **kwargs):
    instance.profile.save()
    
post_save.connect(create_user_profile, sender=User)
post_save.connect(save_user_profile, sender=User)