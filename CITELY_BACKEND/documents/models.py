from django.db import models
from userauths.models import User


class Document(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='documents', null=True, blank=True)
    file = models.FileField(upload_to='pdfs/')
    title = models.CharField(max_length=255, blank=True)
    citation_style = models.CharField(max_length=64, default='apa')
    year_from = models.PositiveIntegerField(null=True, blank=True)
    year_to = models.PositiveIntegerField(null=True, blank=True)
    manuscript_content = models.JSONField(default=list, blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title or self.file.name

    class Meta:
        ordering = ['-uploaded_at']

class Citation(models.Model):
    document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name='citations')
    sentence = models.TextField()
    intent = models.CharField(max_length=100)
    score = models.FloatField()
    
    # Position Metadata (JSON storage for simplicity or discrete fields)
    page_number = models.IntegerField(null=True)
    bounding_boxes = models.JSONField(default=list)
    page_width = models.FloatField(null=True)
    page_height = models.FloatField(null=True)
    
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Gap: {self.sentence[:30]}..."

class Recommendation(models.Model):
    citation = models.ForeignKey(Citation, on_delete=models.CASCADE, related_name='recommendations')
    title = models.TextField()
    authors = models.TextField()
    year = models.CharField(max_length=20, null=True, blank=True)
    abstract = models.TextField(null=True, blank=True)
    url = models.URLField(max_length=1000, null=True, blank=True)
    doi = models.CharField(max_length=255, null=True, blank=True)
    is_open_access = models.BooleanField(default=False)
    influential_citations = models.IntegerField(default=0)
    
    def __str__(self):
        return self.title


class InsertedCitation(models.Model):
    document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name='inserted_citations')
    recommendation = models.ForeignKey(
        Recommendation, on_delete=models.SET_NULL, null=True, blank=True, related_name='insertions'
    )
    citation_gap = models.ForeignKey(
        Citation, on_delete=models.SET_NULL, null=True, blank=True, related_name='insertions'
    )
    sentence_text = models.TextField(blank=True)
    formatted_intext = models.TextField()
    csl_item = models.JSONField(default=dict)
    anchor_id = models.CharField(max_length=64, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.formatted_intext[:50]
