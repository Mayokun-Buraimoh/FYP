from rest_framework import serializers
from .models import Document, Citation, Recommendation, InsertedCitation


class RecommendationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Recommendation
        fields = '__all__'


class CitationSerializer(serializers.ModelSerializer):
    recommendations = RecommendationSerializer(many=True, read_only=True)

    class Meta:
        model = Citation
        fields = '__all__'


class InsertedCitationSerializer(serializers.ModelSerializer):
    class Meta:
        model = InsertedCitation
        fields = (
            'id',
            'recommendation',
            'citation_gap',
            'sentence_text',
            'formatted_intext',
            'csl_item',
            'anchor_id',
            'created_at',
        )
        read_only_fields = ('id', 'created_at')


class DocumentSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()
    citations = CitationSerializer(many=True, read_only=True)
    inserted_citations = InsertedCitationSerializer(many=True, read_only=True)

    class Meta:
        model = Document
        fields = (
            'id',
            'title',
            'file',
            'file_url',
            'uploaded_at',
            'citation_style',
            'year_from',
            'year_to',
            'manuscript_content',
            'citations',
            'inserted_citations',
        )
        read_only_fields = ('uploaded_at', 'file_url', 'citations', 'inserted_citations')
        extra_kwargs = {'file': {'write_only': False}}

    def get_file_url(self, obj):
        request = self.context.get('request')
        if obj.file and request:
            return request.build_absolute_uri(obj.file.url)
        return None


class DocumentUpdateSerializer(serializers.ModelSerializer):
    """PATCH only citation_style and manuscript_content."""

    class Meta:
        model = Document
        fields = ('citation_style', 'year_from', 'year_to', 'manuscript_content')
